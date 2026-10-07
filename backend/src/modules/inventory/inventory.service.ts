import { Types, type ClientSession } from 'mongoose';
import { InventoryCategory } from '../../models/InventoryCategory';
import { InventoryItem } from '../../models/InventoryItem';
import { InventoryMovement, type MovementType } from '../../models/InventoryMovement';
import { AppError } from '../../utils/AppError';
import { recordAudit } from '../../utils/audit';
import type { ActorMeta } from '../../utils/actor';
import { parsePaginationQuery } from '../../utils/paginate';
import { assertExistsInSchool, exactRegex, listSort, searchRegex } from '../../utils/query';
import { buildPaginationMeta } from '../../utils/response';
import { withTransaction } from '../../utils/transaction';
import { nextSequence } from '../../services/sequence.service';
import type {
  CreateCategoryInput,
  CreateItemInput,
  RecordMovementInput,
  UpdateCategoryInput,
  UpdateItemInput,
} from './inventory.validation';

/** Which way each movement type moves stock. ADJUST carries its own sign. */
const DIRECTION: Record<MovementType, 1 | -1 | 0> = {
  RECEIVE: 1,
  RETURN: 1,
  ISSUE: -1,
  WRITE_OFF: -1,
  ADJUST: 0,
};

const LOW_STOCK = { $expr: { $and: [{ $gt: ['$reorderLevel', 0] }, { $lte: ['$quantityOnHand', '$reorderLevel'] }] } };

// ─── Categories ──────────────────────────────────────────────────────────────

async function itemCounts(categoryIds: Types.ObjectId[]): Promise<Map<string, number>> {
  if (!categoryIds.length) return new Map();
  const rows = await InventoryItem.aggregate<{ _id: Types.ObjectId; count: number }>([
    { $match: { categoryId: { $in: categoryIds }, deletedAt: null } },
    { $group: { _id: '$categoryId', count: { $sum: 1 } } },
  ]);
  return new Map(rows.map((r) => [String(r._id), r.count]));
}

export async function listCategories(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (search) filter.name = searchRegex(search);
  const safeSort = listSort(query, ['name', 'createdAt'], { name: 1 });
  const [categories, total] = await Promise.all([
    InventoryCategory.find(filter).sort(safeSort).skip(skip).limit(limit).lean(),
    InventoryCategory.countDocuments(filter),
  ]);
  const counts = await itemCounts(categories.map((c) => c._id));
  const items = categories.map((c) => ({ ...c, itemCount: counts.get(String(c._id)) ?? 0 }));
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getCategoryById(id: string) {
  const category = await InventoryCategory.findOne({ _id: id, deletedAt: null }).lean();
  if (!category) throw AppError.notFound('Category not found');
  const counts = await itemCounts([category._id]);
  return { ...category, itemCount: counts.get(String(category._id)) ?? 0 };
}

async function assertCategoryNameFree(name: string, exceptId?: string) {
  const clash = await InventoryCategory.findOne({
    name: exactRegex(name),
    deletedAt: null,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }).lean();
  if (clash) throw AppError.conflict(`A category named "${name}" already exists`, { field: 'name' });
}

export async function createCategory(input: CreateCategoryInput, actor: ActorMeta) {
  await assertCategoryNameFree(input.name);
  const created = await InventoryCategory.create({ schoolId: actor.schoolId, ...input });
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'inventory.category.create',
    entity: 'InventoryCategory',
    entityId: created._id,
    after: created.toObject(),
    ip: actor.ip,
  });
  return getCategoryById(String(created._id));
}

export async function updateCategory(id: string, input: UpdateCategoryInput, actor: ActorMeta) {
  const category = await InventoryCategory.findOne({ _id: id, deletedAt: null });
  if (!category) throw AppError.notFound('Category not found');
  if (input.name && input.name !== category.name) await assertCategoryNameFree(input.name, id);
  const before = category.toObject();
  category.set(input);
  await category.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'inventory.category.update',
    entity: 'InventoryCategory',
    entityId: category._id,
    before,
    after: category.toObject(),
    ip: actor.ip,
  });
  return getCategoryById(id);
}

export async function deleteCategory(id: string, actor: ActorMeta) {
  const category = await InventoryCategory.findOne({ _id: id, deletedAt: null });
  if (!category) throw AppError.notFound('Category not found');
  const inUse = await InventoryItem.countDocuments({ categoryId: category._id, deletedAt: null });
  if (inUse > 0) {
    throw AppError.conflict(`${inUse} item${inUse === 1 ? ' is' : 's are'} still in this category. Move or archive them first.`);
  }
  const before = category.toObject();
  category.deletedAt = new Date();
  await category.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'inventory.category.delete',
    entity: 'InventoryCategory',
    entityId: category._id,
    before,
    after: category.toObject(),
    ip: actor.ip,
  });
}

// ─── Items ───────────────────────────────────────────────────────────────────

const ITEM_POPULATE = { path: 'categoryId', select: 'name' };

export async function listItems(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (typeof query.categoryId === 'string') filter.categoryId = query.categoryId;
  if (query.stock === 'low') Object.assign(filter, LOW_STOCK);
  if (query.stock === 'out') filter.quantityOnHand = 0;
  if (query.stock === 'in') filter.quantityOnHand = { $gt: 0 };
  if (search) {
    const rx = searchRegex(search);
    filter.$or = [{ name: rx }, { sku: rx }, { location: rx }];
  }
  const safeSort = listSort(query, ['name', 'sku', 'quantityOnHand', 'unitCostMinor', 'createdAt'], { name: 1 });
  const [items, total] = await Promise.all([
    InventoryItem.find(filter).sort({ ...safeSort, _id: 1 }).skip(skip).limit(limit).populate(ITEM_POPULATE).lean(),
    InventoryItem.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

export async function getItemById(id: string) {
  const item = await InventoryItem.findOne({ _id: id, deletedAt: null }).populate(ITEM_POPULATE).lean();
  if (!item) throw AppError.notFound('Item not found');
  return item;
}

async function assertItemNameFree(name: string, exceptId?: string) {
  const clash = await InventoryItem.findOne({
    name: exactRegex(name),
    deletedAt: null,
    ...(exceptId ? { _id: { $ne: exceptId } } : {}),
  }).lean();
  if (clash) throw AppError.conflict(`An item named "${name}" already exists (${clash.sku})`, { field: 'name' });
}

/**
 * Applies one stock movement atomically. The quantity guard lives IN the
 * update's filter, so two storekeepers issuing the last box at the same
 * moment can't both succeed — the second update simply doesn't match, and
 * the stock can never go negative. The ledger row is written in the same
 * transaction, so balance and history can't disagree.
 */
async function applyMovement(
  itemId: Types.ObjectId | string,
  input: RecordMovementInput,
  actor: ActorMeta,
  session: ClientSession,
) {
  const direction = DIRECTION[input.type];
  const change = direction === 0 ? input.quantity : direction * Math.abs(input.quantity);

  const update: Record<string, unknown> = { $inc: { quantityOnHand: change } };
  // A receipt at a stated cost updates the item's current unit cost.
  if (input.type === 'RECEIVE' && input.unitCostMinor !== undefined) {
    update.$set = { unitCostMinor: input.unitCostMinor };
  }

  const item = await InventoryItem.findOneAndUpdate(
    { _id: itemId, deletedAt: null, ...(change < 0 ? { quantityOnHand: { $gte: -change } } : {}) },
    update,
    { new: true, session },
  );
  if (!item) {
    const exists = await InventoryItem.findOne({ _id: itemId, deletedAt: null }).session(session).lean();
    if (!exists) throw AppError.notFound('Item not found');
    throw AppError.conflict(`Only ${exists.quantityOnHand} in stock — can't remove ${Math.abs(change)}`, {
      field: 'quantity',
      available: exists.quantityOnHand,
    });
  }

  const [movement] = await InventoryMovement.create(
    [
      {
        schoolId: actor.schoolId,
        itemId: item._id,
        type: input.type,
        quantityChange: change,
        balanceAfter: item.quantityOnHand,
        unitCostMinor: input.unitCostMinor ?? item.unitCostMinor,
        party: input.party,
        reference: input.reference,
        note: input.note,
        occurredAt: input.occurredAt ?? new Date(),
        recordedByUserId: actor.actorUserId,
      },
    ],
    { session },
  );
  if (!movement) throw AppError.internal('Failed to record the movement');
  return movement;
}

export async function createItem(input: CreateItemInput, actor: ActorMeta) {
  await assertExistsInSchool(InventoryCategory, input.categoryId, 'Category', 'categoryId');
  await assertItemNameFree(input.name);
  if (input.sku) {
    const clash = await InventoryItem.exists({ sku: input.sku.toUpperCase(), deletedAt: null });
    if (clash) throw AppError.conflict(`Stock code ${input.sku.toUpperCase()} is already in use`, { field: 'sku' });
  }

  const itemId = await withTransaction(async (session) => {
    const { openingQuantity, ...fields } = input;
    const sku = fields.sku || (await nextSequence('inventory-item', { prefix: 'ITM' }, session));
    const [item] = await InventoryItem.create(
      [{ ...fields, sku, schoolId: actor.schoolId, quantityOnHand: 0 }],
      { session },
    );
    if (!item) throw AppError.internal('Failed to create the item');

    if (openingQuantity > 0) {
      await applyMovement(
        item._id,
        { type: 'RECEIVE', quantity: openingQuantity, unitCostMinor: input.unitCostMinor, note: 'Opening stock' },
        actor,
        session,
      );
    }

    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: 'inventory.item.create',
      entity: 'InventoryItem',
      entityId: item._id,
      after: { ...item.toObject(), openingQuantity },
      ip: actor.ip,
      session,
    });
    return String(item._id);
  });
  return getItemById(itemId);
}

export async function updateItem(id: string, input: UpdateItemInput, actor: ActorMeta) {
  const item = await InventoryItem.findOne({ _id: id, deletedAt: null });
  if (!item) throw AppError.notFound('Item not found');
  if (input.categoryId) await assertExistsInSchool(InventoryCategory, input.categoryId, 'Category', 'categoryId');
  if (input.name && input.name !== item.name) await assertItemNameFree(input.name, id);

  const before = item.toObject();
  item.set(input);
  await item.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'inventory.item.update',
    entity: 'InventoryItem',
    entityId: item._id,
    before,
    after: item.toObject(),
    ip: actor.ip,
  });
  return getItemById(id);
}

/**
 * Archiving an item with stock on the books would make that stock vanish
 * from every valuation without a trace; the remainder must be written off
 * (a ledger entry with a reason) first.
 */
export async function deleteItem(id: string, actor: ActorMeta) {
  const item = await InventoryItem.findOne({ _id: id, deletedAt: null });
  if (!item) throw AppError.notFound('Item not found');
  if (item.quantityOnHand > 0) {
    throw AppError.conflict(`${item.quantityOnHand} still in stock. Write it off before archiving the item.`);
  }
  const before = item.toObject();
  item.deletedAt = new Date();
  await item.save();
  await recordAudit({
    schoolId: actor.schoolId,
    actorUserId: actor.actorUserId,
    action: 'inventory.item.delete',
    entity: 'InventoryItem',
    entityId: item._id,
    before,
    after: item.toObject(),
    ip: actor.ip,
  });
}

// ─── Movements ───────────────────────────────────────────────────────────────

export async function recordMovement(itemId: string, input: RecordMovementInput, actor: ActorMeta) {
  const movementId = await withTransaction(async (session) => {
    const movement = await applyMovement(itemId, input, actor, session);
    await recordAudit({
      schoolId: actor.schoolId,
      actorUserId: actor.actorUserId,
      action: `inventory.stock.${input.type.toLowerCase()}`,
      entity: 'InventoryMovement',
      entityId: movement._id,
      after: movement.toObject(),
      ip: actor.ip,
      session,
    });
    return movement._id;
  });

  const [movement, item] = await Promise.all([
    InventoryMovement.findById(movementId).populate({ path: 'recordedByUserId', select: 'firstName lastName' }).lean(),
    getItemById(itemId),
  ]);
  return { movement, item };
}

export async function listMovements(query: Record<string, unknown>) {
  const { page, limit, skip, search } = parsePaginationQuery(query);
  const filter: Record<string, unknown> = { deletedAt: null };
  if (typeof query.itemId === 'string') filter.itemId = query.itemId;
  if (search) {
    const rx = searchRegex(search);
    filter.$or = [{ party: rx }, { reference: rx }, { note: rx }];
  }
  if (typeof query.type === 'string') filter.type = query.type;
  if (query.from instanceof Date || query.to instanceof Date) {
    filter.occurredAt = {
      ...(query.from instanceof Date ? { $gte: query.from } : {}),
      ...(query.to instanceof Date ? { $lte: query.to } : {}),
    };
  }
  const safeSort = listSort(query, ['occurredAt', 'createdAt'], { occurredAt: -1 });
  const [items, total] = await Promise.all([
    InventoryMovement.find(filter)
      .sort({ ...safeSort, _id: -1 })
      .skip(skip)
      .limit(limit)
      .populate([
        { path: 'itemId', select: 'name sku unit' },
        { path: 'recordedByUserId', select: 'firstName lastName' },
      ])
      .lean(),
    InventoryMovement.countDocuments(filter),
  ]);
  return { items, meta: buildPaginationMeta(page, limit, total) };
}

/** Headline numbers for the inventory overview and the school dashboard. */
export async function getInventorySummary() {
  const [totals] = await InventoryItem.aggregate<{
    itemCount: number;
    stockValueMinor: number;
    outOfStock: number;
    lowStock: number;
  }>([
    { $match: { deletedAt: null } },
    {
      $group: {
        _id: null,
        itemCount: { $sum: 1 },
        stockValueMinor: { $sum: { $multiply: ['$quantityOnHand', '$unitCostMinor'] } },
        outOfStock: { $sum: { $cond: [{ $eq: ['$quantityOnHand', 0] }, 1, 0] } },
        lowStock: { $sum: { $cond: [LOW_STOCK.$expr, 1, 0] } },
      },
    },
  ]);

  const since = new Date(Date.now() - 30 * 86_400_000);
  const [categoryCount, lowStockItems, movementsLast30Days] = await Promise.all([
    InventoryCategory.countDocuments({ deletedAt: null }),
    InventoryItem.find({ deletedAt: null, ...LOW_STOCK })
      .sort({ quantityOnHand: 1, name: 1 })
      .limit(5)
      .select('name sku unit quantityOnHand reorderLevel')
      .lean(),
    InventoryMovement.countDocuments({ deletedAt: null, occurredAt: { $gte: since } }),
  ]);

  return {
    itemCount: totals?.itemCount ?? 0,
    stockValueMinor: totals?.stockValueMinor ?? 0,
    outOfStockCount: totals?.outOfStock ?? 0,
    lowStockCount: totals?.lowStock ?? 0,
    categoryCount,
    movementsLast30Days,
    lowStockItems,
  };
}
