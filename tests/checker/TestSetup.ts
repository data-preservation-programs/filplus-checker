import {Pool} from "pg";
import {FileUploadConfig} from "../../src/checker/CidChecker";

const createGeoStatement = `CREATE TABLE IF NOT EXISTS active_miners
                            (
                                miner_id          TEXT    NOT NULL PRIMARY KEY,
                                last_updated      INTEGER NOT NULL,
                                raw_byte_power    BIGINT  NOT NULL,
                                quality_adj_power BIGINT  NOT NULL,
                                country           TEXT,
                                region            TEXT,
                                city              TEXT,
                                metro             INTEGER,
                                latitude          REAL,
                                longitude         REAL,
                                radius            REAL
                            )`;
const insertGeoStatement = `INSERT INTO active_miners
                            (miner_id, last_updated, raw_byte_power, quality_adj_power, country, region, city, metro,
                             latitude, longitude, radius)
                            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;
const createStatement = `CREATE TABLE IF NOT EXISTS current_state
                         (
                             deal_id                 INTEGER NOT NULL PRIMARY KEY,
                             piece_cid               TEXT    NOT NULL,
                             piece_size              BIGINT  NOT NULL,
                             verified_deal           BOOLEAN NOT NULL,
                             client                  TEXT    NOT NULL,
                             provider                TEXT    NOT NULL,
                             label                   TEXT    NOT NULL,
                             start_epoch             INTEGER NOT NULL,
                             end_epoch               INTEGER NOT NULL,
                             storage_price_per_epoch BIGINT  NOT NULL,
                             provider_collateral     BIGINT  NOT NULL,
                             client_collateral       BIGINT  NOT NULL,
                             sector_start_epoch      INTEGER NOT NULL,
                             last_updated_epoch      INTEGER NOT NULL,
                             slash_epoch             INTEGER NOT NULL
                         )`;

const createClientMappingStatement = `CREATE TABLE IF NOT EXISTS client_mapping
                                      (
                                          client         TEXT NOT NULL PRIMARY KEY,
                                          client_address TEXT NOT NULL
                                      )`;

const insertClientMappingStatement = `INSERT INTO client_mapping (client, client_address)
                                      VALUES ($1, $2)`;

const insertCurrentStateStatement = `INSERT INTO current_state (deal_id, piece_cid, piece_size, verified_deal, client,
                                                                provider, label, start_epoch, end_epoch,
                                                                storage_price_per_epoch,
                                                                provider_collateral, client_collateral,
                                                                sector_start_epoch,
                                                                last_updated_epoch, slash_epoch)
                                     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                                             $10, $11, $12, $13, $14, $15)`;


export const fileUploadConfig: FileUploadConfig = {
  committerName: 'test-name',
  repo: 'test-repo',
  branch: 'test-branch',
  committerEmail: 'test-email',
  owner: 'test-owner',
  searchRepo: 'test-search-repo',
}

let initialized = false;
export const testDatabase = new Pool({
  host: 'localhost',
  user: 'postgres',
  password: 'postgres',
  database: 'postgres',
})

export async function setupDatabase() {
  if (initialized) {
    return;
  }
  initialized = true;
  await testDatabase.query("DROP TABLE IF EXISTS current_state");
  await testDatabase.query("DROP TABLE IF EXISTS client_mapping");
  await testDatabase.query("DROP TABLE IF EXISTS active_miners");
  await testDatabase.query(createStatement);
  await testDatabase.query(createClientMappingStatement);
  await testDatabase.query(createGeoStatement);
  await testDatabase.query(insertClientMappingStatement, ['f01000', 'f12345']);
  await testDatabase.query(insertClientMappingStatement, ['f02000', 'fxxxx2']);
  await testDatabase.query(insertClientMappingStatement, ['f03000', 'fxxxx3']);
  let id = 0
  const addDeal = async (client: string, provider: string, piece: string) => {
    await testDatabase.query(insertCurrentStateStatement, [++id, piece, 100, true, client, provider, "", 1, 999999999, 0, 0, 0, 1, 1, -1])
  }
  await addDeal('f01000', 'provider0', 'piece0')
  await addDeal('f01000', 'provider0', 'piece0')
  await addDeal('f01000', 'provider0', 'piece0')
  await addDeal('f01000', 'provider0', 'piece0')
  await addDeal('f01000', 'provider1', 'piece1')
  await addDeal('f01000', 'provider2', 'piece1')
  await addDeal('f01000', 'provider3', 'piece1')
  await addDeal('f01000', 'provider4', 'piece2')
  await addDeal('f01000', 'provider5', 'piece3')
  await addDeal('f01000', 'provider5', 'piece3')
  await addDeal('f02000', 'provider6', 'piece1')
  await addDeal('f03000', 'provider7', 'piece2')
  await addDeal('f03000', 'provider7', 'piece3')
  const addProvider = async (provider: string, location: string) => {
    const [country, region, city] = location.split(',')
    const latitude = Math.random() * 180 - 90
    const longitude = Math.random() * 180 - 90
    const radius = Math.random() * 1000
    await testDatabase.query(insertGeoStatement, [provider, 0, 0, 0, country, region, city, 0, latitude, longitude, radius])
  }
  await addProvider('provider0', '')
  await addProvider('provider1', 'US,CA,San Francisco')
  await addProvider('provider2', 'US,CA,San Francisco')
  await addProvider('provider3', 'US,OR,Portland')
  await addProvider('provider4', 'US,NY,New York')
  await addProvider('provider5', 'CN,,Beijing')
  await addProvider('provider6', 'UK,,London')
  await addProvider('provider7', 'AU,,Sydney')
}
