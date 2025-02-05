import { LOG_PREFIX, MODULE_ID } from '../constants';
import SettingKeys, { Source, SourceType } from '../settings';
import { getGame, getModuleSetting } from '../utils';

/***
 * Builds the indexes for all sources.
 * (note that items without a source compendium are not indexed,
 *  like Class Features or Backgrounds, as they are taken from advancements)
 */
export async function buildSourceIndexes() {
  console.info(`${LOG_PREFIX} | Indexing source compendiums`);
  const sourcePacks: Source = (await game.settings.get(MODULE_ID, SettingKeys.SOURCES)) as Source;
  const itemsPromises: Promise<Item | null | undefined>[] = [];
  game.packs
    .filter((p) => p.documentName == 'Item')
    .forEach((p) => {
      const name = p.collection;
      const fieldsToIndex = new Set<string>();

      // name added by default on all when indexed
      addHeritageFields(fieldsToIndex, sourcePacks, name);
      addHeritageFeaturesFields(fieldsToIndex, sourcePacks, name);
      addBackgroundFields(fieldsToIndex, sourcePacks, name);
      addBackgroundFeaturesFields(fieldsToIndex, sourcePacks, name);
      addCultureFields(fieldsToIndex, sourcePacks, name);
      addCultureFeaturesFields(fieldsToIndex, sourcePacks, name);
      addDestinyFields(fieldsToIndex, sourcePacks, name);
      addDestinyFeaturesFields(fieldsToIndex, sourcePacks, name);
      addClassFields(fieldsToIndex, sourcePacks, name);
      addClassFeaturesFields(fieldsToIndex, sourcePacks, name);
      addArchetypeFields(fieldsToIndex, sourcePacks, name);
      addSpellFields(fieldsToIndex, sourcePacks, name);
      addFeatFields(fieldsToIndex, sourcePacks, name);
      addManeuversFields(fieldsToIndex, sourcePacks, name);
      addEquipmentFields(fieldsToIndex, sourcePacks, name);

      if (fieldsToIndex.size) {
        fieldsToIndex.add('img');
        itemsPromises.push((p as any).getIndex({ fields: [...fieldsToIndex] }));
      }
    });
  await Promise.all(itemsPromises);
}

export async function getIndexEntriesForSource(source: keyof Source) {
  const sources: Source = (await game.settings.get(MODULE_ID, SettingKeys.SOURCES)) as Source;

  const indexEntries = [];
  for (const packName of sources[source]) {
    const pack = game.packs.get(packName);
    if (!pack) ui.notifications?.warn(`No pack for name [${packName}]!`);
    if (pack?.documentName !== 'Item') throw new Error(`${packName} is not an Item pack`);
    const itemPack = pack as CompendiumCollection<CompendiumCollection.Metadata & { entity: 'Item' }>;
    if ((itemPack as any).indexed) {
      const packIndexEntries = [...(await itemPack.index)];
      indexEntries.push(...packIndexEntries.map((e) => ({ ...e, _pack: packName, _uuid: buildUuid(e._id, packName) })));
    } else {
      console.error(`Index not built for pack [${packName}] - skipping it`);
    }
  }
  return indexEntries;
}

export async function hydrateItems(indexEntries: Array<IndexEntry>): Promise<Item[]> {
  console.info(`${LOG_PREFIX} | Hydrating items:`);
  const worldItems = game.items;
  if (!worldItems) throw new Error('game.items not initialized yet');

  const itemPromises = indexEntries.map(async (indexEntry) => {
    if ((indexEntry as any).custom) {
      return indexEntry; // return custom items as-is
    }
    const quantity = (indexEntry as any).system?.quantity;
    // if the entry has a local item, use that instead of fetching it from a compendium
    const item = indexEntry.local ?? (await game.packs.get(indexEntry._pack)?.getDocument(indexEntry._id));
    if (!item) throw new Error(`No item for id ${indexEntry._id}!`);
    const itemForEmbedding = worldItems.fromCompendium(item as Item);
    if (quantity) {
      (itemForEmbedding! as any).system.quantity = quantity;
    }
    if ((indexEntry as any)._advancement) {
      (itemForEmbedding as any)._advancement = (indexEntry as any)._advancement;
    }
    return itemForEmbedding;
  });
  return (await Promise.all(itemPromises)) as any;
}

export async function getIndexEntryByUuid(uuid: string): Promise<IndexEntry> {
  const { pack, id } = parseUuid(uuid);

  if (pack === 'Item') {
    // local item, not from Compendium
    const item = getGame().items?.get(id);
    if (!item) {
      ui?.notifications?.error(getGame().i18n.format('HCT.Error.IndexEntryNotFound', { uuid }));
      throw new Error(`No index entry for uuid ${uuid}`);
    }
    return toIndexEntry(item);
  }

  await onceAsync(() => (getGame().packs.get(pack) as any)?.getIndex({ fields: ['img'] }), pack);
  const packIndex = getGame().packs.get(pack)?.index;
  if (!packIndex) throw new Error(`Pack ${pack} not indexed or index not found`);
  // await (packCollection as any)?.getIndex({ fields: ['img'] });

  const indexedEntry = packIndex.find((i) => i._id === id) as IndexEntry;
  if (!indexedEntry) {
    ui?.notifications?.error(getGame().i18n.format('HCT.Error.IndexEntryNotFound', { uuid }));
    throw new Error(`No index entry for uuid ${uuid}`);
  }
  return {
    ...indexedEntry,
    _pack: pack,
    _uuid: uuid,
  };
}

const onceAsync = (() => {
  const indexedPacks: Map<string, Promise<void>> = new Map<string, Promise<void>>();

  return function (loader: () => Promise<void> | undefined, packName: string) {
    const p = indexedPacks.get(packName);
    if (p) return p;
    const newPromise = Promise.resolve(loader());
    newPromise.catch(() => indexedPacks.delete(packName));
    indexedPacks.set(packName, newPromise);
    return newPromise;
  };
})();

function toIndexEntry(item: Item): IndexEntry {
  return {
    _pack: item.pack!,
    _id: (item as any)._id!,
    _uuid: item.uuid,
    name: item.name!,
    type: item.type,
    img: item.img ?? '',
    local: item,
  };
}

function parseUuid(uuid: string): { pack: any; id: any } {
  const firstDot = uuid.indexOf('.');
  const lastDot = uuid.lastIndexOf('.');

  const pack = uuid.startsWith('Item') ? 'Item' : uuid.substring(firstDot + 1, lastDot);
  const id = uuid.substring(lastDot + 1);
  return { pack, id };
}

function buildUuid(id: string, pack?: string): string {
  //'Compendium.dnd5e.spells.04nMsTWkIFvkbXlY'
  //'Item.PbEAMotRyx4yLbNq'
  if (!id) throw new Error('UUID needs a Document id');
  const location = pack ? 'Compendium.' + pack : 'Item';
  return `${location}.${id}`;
}

export type IndexEntry = {
  _id: string;
  _pack: string;
  _uuid: string;
  type: string;
  name: string;
  img: string;
  local?: Item; // for cases where we take the item from the directory instead of from a compendium index
};

export type EntryAdvancement = {
  _id: string;
  icon: string;
  type: string;
};

export type EntryHitPointsAdvancement = EntryAdvancement & {
  type: 'HitPoints';
};

export type EntryItemGrantAdvancement = EntryAdvancement & {
  type: 'ItemGrant';
  level: number;
  configuration: {
    items: string[];
  };
};

export type EntryScaleValueAdvancement = EntryAdvancement & {
  type: 'ScaleValue';
  title: string;
  configuration: {
    identifier: string;
    type: string;
    scale: { [key: number]: { value: number } };
  };
};

// Heritage
export type HeritageEntry = IndexEntry & {
  system: {
    requirements: string;
    description: { value: string };
  };
};
export function addHeritageFields(fieldsToIndex: Set<string>, source: Source, packName: string) {
  if (source[SourceType.HERITAGES].includes(packName)) {
    fieldsToIndex.add('system.requirements'); // for figuring subheritagees
    fieldsToIndex.add('system.description.value'); // for sidebar
  }
}
export async function getHeritageEntries() {
  const heritageEntries = await (getIndexEntriesForSource(SourceType.HERITAGES) as unknown as Promise<HeritageEntry[]>);
  // sanitize entries to remove anything nonconforming to a Feature (for now, until Heritage becomes a type)
  return heritageEntries.filter((r) => r.type == 'feat');
}

// Heritage Feature
export type HeritageFeatureEntry = IndexEntry & {
  system: { requirements: string };
};
export function addHeritageFeaturesFields(fieldsToIndex: Set<string>, source: Source, packName: string) {
  if (source[SourceType.HERITAGE_FEATURES].includes(packName)) {
    fieldsToIndex.add('system.requirements'); // for mapping racial features to Heritages/subheritagees
  }
}
export async function getHeritageFeatureEntries() {
  const heritageFeatureEntries = await (getIndexEntriesForSource(SourceType.HERITAGE_FEATURES) as unknown as Promise<
  HeritageFeatureEntry[]
  >);
  // sanitize entries to remove anything nonconforming to a Feature (for now at least, if Heritage Features become a type in the future)
  return heritageFeatureEntries.filter((f) => f.type == 'feat' && f?.system?.requirements !== '');
}

// Class
export type ClassEntry = IndexEntry & {
  system: {
    advancement: (EntryHitPointsAdvancement | EntryItemGrantAdvancement | EntryScaleValueAdvancement)[];
    description: { value: string };
    identifier: string;
    hitDice: string;
    saves: string[];
    levels: number;
    skills: {
      number: number;
      choices: string[];
      value: string[];
    };
    spellcasting: {
      ability: string;
      progression: string;
    };
  };
};
export function addClassFields(fieldsToIndex: Set<string>, source: Source, packName: string) {
  if (source[SourceType.CLASSES].includes(packName)) {
    fieldsToIndex.add('system.advancement');
    fieldsToIndex.add('system.description.value'); // for sidebar
    fieldsToIndex.add('system.identifier');
    fieldsToIndex.add('system.hitDice');
    fieldsToIndex.add('system.saves');
    fieldsToIndex.add('system.skills');
    fieldsToIndex.add('system.spellcasting');
  }
}
export async function getClassEntries() {
  const classEntries = await (getIndexEntriesForSource(SourceType.CLASSES) as unknown as Promise<ClassEntry[]>);
  // sanitize entries to remove anything nonconforming to a Class
  return classEntries.filter((c) => c.type == 'class');
}

// Class Feature
export type ClassFeatureEntry = IndexEntry & {
  system: {
    description: { value: string };
    requirements: string;
  };
  _advancement: {
    id: string;
    uuid: string;
    lv?: number;
  };
};
// export function addClassFeaturesFields(fieldsToIndex: Set<string>, source: Source, packName: string) {
//   if (source[SourceType.CLASS_FEATURES].includes(packName)) {
//     fieldsToIndex.add('system.requirements'); // for mapping class features to classes
//     fieldsToIndex.add('system.description'); // used to show Spellcasting/Pact Magic features on the Spells tab
//   }
// }
export async function getClassFeatureEntries() {
  const classFeatureEntries = await (getIndexEntriesForSource(SourceType.CLASS_FEATURES) as unknown as Promise<
    ClassFeatureEntry[]
  >);
  // sanitize entries to remove anything nonconforming to a Feature (for now at least, if Class Features become a type in the future)
  return classFeatureEntries.filter((f) => f.type == 'feat' && f?.system?.requirements !== '');
}

// Subclass
export type SubclassEntry = IndexEntry & {
  system: {
    advancement: (EntryItemGrantAdvancement | EntryScaleValueAdvancement)[];
    description: { value: string };
    identifier: string;
    classIdentifier: string;
    spellcasting: {
      ability: string;
      progression: string;
    };
  };
};
export function addSubclassFields(fieldsToIndex: Set<string>, source: Source, packName: string) {
  if (source[SourceType.SUBCLASSES].includes(packName)) {
    fieldsToIndex.add('system.advancement');
    fieldsToIndex.add('system.description.value'); // for sidebar
    fieldsToIndex.add('system.identifier');
    fieldsToIndex.add('system.classIdentifier');
    fieldsToIndex.add('system.spellcasting.ability');
    fieldsToIndex.add('system.spellcasting.progression');
  }
}
export async function getSubclassEntries() {
  const sourceEntries = await (getIndexEntriesForSource(SourceType.SUBCLASSES) as unknown as Promise<SubclassEntry[]>);
  // sanitize entries to remove anything nonconforming to a Subclass
  const subclassEntries = sourceEntries.filter((c) => c.type == 'subclass');
  if (getModuleSetting(SettingKeys.TRIM_SUBCLASSES)) {
    // Mostly for DDBImporter stuff: e.g "Assassin (Rogue)" > "Assassin"
    return subclassEntries.map((e) => ({ ...e, name: clearClassName(e.name) }));
  }
  return subclassEntries;
}

function clearClassName(name: string) {
  return name.lastIndexOf('(') > 0 ? name.substring(0, name.lastIndexOf('(') - 1).trim() : name;
}

// Background
export type BackgroundEntry = IndexEntry & unknown;
export function addBackgroundFields(fieldsToIndex: Set<string>, source: Source, packName: string) {
  if (source[SourceType.BACKGROUNDS].includes(packName)) {
    fieldsToIndex.add('name');
  }
}
export async function getBackgroundEntries() {
  const backgroundEntries = await (getIndexEntriesForSource(SourceType.BACKGROUNDS) as unknown as Promise<
    BackgroundEntry[]
  >);
  // sanitize entries to remove anything nonconforming to a Feature (for now at least, if Background Features become a type in the future)
  return backgroundEntries.filter((f) => f.type == 'background');
}

// Equipment
export type EquipmentEntry = IndexEntry & {
  system: {
    price: { value: number; denomination: string };
    rarity: string;
    quantity?: number;
  };
};
export function addEquipmentFields(fieldsToIndex: Set<string>, source: Source, packName: string) {
  if (source[SourceType.ITEMS].includes(packName)) {
    fieldsToIndex.add('system.price');
    fieldsToIndex.add('system.rarity');
    fieldsToIndex.add('system.quantity');
    //fieldsToIndex.add('system.description'); maybe description to find Spellcasting Foci ?
  }
}
export async function getEquipmentEntries() {
  const equipmentEntries = await (getIndexEntriesForSource(SourceType.ITEMS) as unknown as Promise<EquipmentEntry[]>);
  // sanitize entries to remove anything nonconforming to an Item
  return equipmentEntries.filter((e) => !['class', 'feat', 'spell'].includes(e.type));
}

// Spell
export type SpellEntry = IndexEntry & {
  system: {
    level: number;
  };
};
export function addSpellFields(fieldsToIndex: Set<string>, source: Source, packName: string) {
  if (source[SourceType.SPELLS].includes(packName)) {
    fieldsToIndex.add('system.level');
  }
}
export async function getSpellEntries() {
  const spellEntries = await (getIndexEntriesForSource(SourceType.SPELLS) as unknown as Promise<SpellEntry[]>);
  // sanitize entries to remove anything nonconforming to a Spell
  return spellEntries.filter((s) => s.type == 'spell');
}

// Feat
export type FeatEntry = IndexEntry & {
  system: { requirements: string };
};
export function addFeatFields(fieldsToIndex: Set<string>, source: Source, packName: string) {
  if (source[SourceType.FEATS].includes(packName)) {
    fieldsToIndex.add('system.requirements'); // TODO if feat has a requirement show it.
  }
}
export async function getFeatEntries() {
  const featEntries = await (getIndexEntriesForSource(SourceType.FEATS) as unknown as Promise<FeatEntry[]>);
  // sanitize entries to remove anything nonconforming to a Feature (for now at least, if Feats become a type in the future)
  return featEntries.filter((f) => f.type == 'feat');
}
