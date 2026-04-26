import dbClient from './lib/dbclient';

type SiteVisitorsSchema = {
  site: string;
  count: number;
}

const DB_NAME = process.env.DB_NAME;
const DB_COLLECTION = process.env.DB_COLLECTION || '';
const SITE = process.env.SITE;

export async function getVisitorCount(): Promise<number | null> {
  const client = await dbClient;
  const collection = client.db(DB_NAME).collection(DB_COLLECTION);
  const results = await collection.findOne<SiteVisitorsSchema>(
    { site: SITE }
  );
  if (results) {
    return results.count;
  } else {
    return null;
  }
}

export async function setVisitorCount(count: number): Promise<void> {
  const client = await dbClient;
  const collection = client.db(DB_NAME).collection(DB_COLLECTION);
  await collection.updateOne({ site: SITE }, { $set: { count } });
}

export async function visitorTick(): Promise<number | null> {
  let count = await getVisitorCount();
  if (count !== null) {
    count += 1; 
    if (process.env.NODE_ENV === 'production') await setVisitorCount(count);
  }
  return count;
}