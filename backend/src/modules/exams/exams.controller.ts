import type { Request, Response } from 'express';
import { Permission } from '@sms/shared';
import { actorFrom } from '../../utils/actor';
import { created, noContent, ok, paginated } from '../../utils/response';
import * as exams from './exams.service';
import * as marks from './marks.service';
import * as results from './results.service';

type Handler = (req: Request, res: Response) => Promise<void>;
const id = (req: Request) => req.params.id as string;
const q = (req: Request) => req.query as Record<string, unknown>;
/** Marks-entry scope from the token: the exam office (who can verify) may enter any paper. */
const viewer = (req: Request): marks.MarksViewer => ({
  userId: req.user!.sub,
  canEnterAny: req.user!.isSuperAdmin || req.user!.permissions.includes(Permission.EXAM_MARKS_PUBLISH),
});

export const getSettings: Handler = async (_req, res) => void ok(res, await exams.getExamSettings());
export const updateSettings: Handler = async (req, res) => void ok(res, await exams.updateExamSettings(req.body, actorFrom(req)));

export const listExams: Handler = async (req, res) => {
  const { items, meta } = await exams.listExams(q(req));
  paginated(res, items, meta);
};
export const getExam: Handler = async (req, res) => void ok(res, await exams.getExam(id(req)));
export const createExam: Handler = async (req, res) => void created(res, await exams.createExam(req.body, actorFrom(req)));
export const updateExam: Handler = async (req, res) => void ok(res, await exams.updateExam(id(req), req.body, actorFrom(req)));
export const deleteExam: Handler = async (req, res) => {
  await exams.deleteExam(id(req), actorFrom(req));
  noContent(res);
};
export const addPapers: Handler = async (req, res) => void created(res, await exams.addPapers(id(req), req.body, actorFrom(req)));
export const saveDateSheet: Handler = async (req, res) =>
  void ok(res, await exams.saveDateSheet(id(req), req.params.classId as string, req.body, actorFrom(req)));
export const getBoard: Handler = async (req, res) => void ok(res, await marks.getBoard(id(req), viewer(req)));
export const getClassSheet: Handler = async (req, res) =>
  void ok(res, await marks.getClassSheet(id(req), req.params.classId as string, q(req).sectionId as string | undefined, viewer(req)));
export const saveStudentMarks: Handler = async (req, res) =>
  void ok(res, await marks.saveStudentMarks(id(req), req.params.studentId as string, req.body, actorFrom(req), viewer(req)));
export const publish: Handler = async (req, res) =>
  void ok(res, await results.publishResults(id(req), (req.body as { classIds: string[] }).classIds, actorFrom(req)));
export const withdraw: Handler = async (req, res) => {
  const { classId, reason } = req.body as { classId: string; reason: string };
  ok(res, await results.withdrawResults(id(req), classId, reason, actorFrom(req)));
};
export const analysis: Handler = async (req, res) => void ok(res, await results.analysis(id(req), q(req).classId as string | undefined));

export const listPapers: Handler = async (req, res) => {
  const { items, meta } = await marks.listPapers(q(req), viewer(req));
  paginated(res, items, meta);
};
export const getPaperSheet: Handler = async (req, res) =>
  void ok(res, await marks.getPaperSheet(id(req), q(req).sectionId as string | undefined, viewer(req)));
export const updatePaper: Handler = async (req, res) => void ok(res, await exams.updatePaper(id(req), req.body, actorFrom(req)));
export const deletePaper: Handler = async (req, res) => {
  await exams.deletePaper(id(req), actorFrom(req));
  noContent(res);
};
export const saveMarks: Handler = async (req, res) => void ok(res, await marks.saveMarks(id(req), req.body, actorFrom(req), viewer(req)));
export const submitPaper: Handler = async (req, res) => void ok(res, await marks.submitPaper(id(req), actorFrom(req), viewer(req)));
export const verifyPaper: Handler = async (req, res) => void ok(res, await marks.verifyPaper(id(req), actorFrom(req)));
export const returnPaper: Handler = async (req, res) =>
  void ok(res, await marks.returnPaper(id(req), (req.body as { reason: string }).reason, actorFrom(req)));

export const listResults: Handler = async (req, res) => {
  const { items, meta } = await results.listResults(q(req));
  paginated(res, items, meta);
};
export const getResult: Handler = async (req, res) => void ok(res, await results.getResult(id(req)));
