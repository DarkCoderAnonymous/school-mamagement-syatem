import { useState } from 'react';
import { router, type Href } from 'expo-router';
import { Text, View } from 'react-native';
import { Screen } from '@/components/ui/screen';
import { Card } from '@/components/ui/card';
import { SearchField } from '@/components/ui/list';
import { EmptyState, SectionTitle } from '@/components/ui/primitives';
import { Tile, TileGrid } from '@/components/ui/tile';
import { useSession } from '@/lib/auth-context';
import { GROUP_TONE, MODULE_GROUPS, modulesFor } from '@/lib/modules';

/**
 * Every module this person can use, grouped like the web sidebar and tinted
 * by area. Search narrows the grid once there are enough modules to hunt for.
 */
export default function ModulesScreen() {
  const { user } = useSession();
  const [search, setSearch] = useState('');
  const mine = modulesFor(user?.permissions);
  const q = search.trim().toLowerCase();
  const matches = q
    ? mine.filter((m) => `${m.title} ${m.description} ${m.group}`.toLowerCase().includes(q))
    : mine;

  return (
    <Screen edges={[]}>
      {mine.length > 6 && (
        <SearchField value={search} onChangeText={setSearch} placeholder="Search modules" />
      )}
      {mine.length === 0 ? (
        <Card>
          <EmptyState
            icon="more"
            title="Nothing here yet"
            description="Your role doesn't include any modules on mobile. Ask your school administrator if you think that's wrong."
          />
        </Card>
      ) : matches.length === 0 ? (
        <Card>
          <EmptyState
            icon="search"
            title="No module matches"
            description="Try another word — or it may only be on the web console."
          />
        </Card>
      ) : (
        MODULE_GROUPS.map((group) => {
          const items = matches.filter((m) => m.group === group);
          if (!items.length) return null;
          return (
            <View key={group} className="gap-2.5">
              <SectionTitle title={group} />
              <TileGrid columns={2}>
                {items.map((m) => (
                  <Tile
                    key={m.key}
                    label={m.title}
                    description={m.description}
                    icon={m.icon}
                    tone={GROUP_TONE[group]}
                    onPress={() => router.push(m.href as Href)}
                  />
                ))}
              </TileGrid>
            </View>
          );
        })
      )}
      <Text className="px-1 text-center text-xs text-muted-foreground">
        Setup work (fee structures, payroll runs, roles, date sheets) stays on the web console.
      </Text>
    </Screen>
  );
}
