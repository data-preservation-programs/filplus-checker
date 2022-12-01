import CidChecker from "../../src/checker/CidChecker";
import {Pool} from "pg";
import {Issue} from "@octokit/webhooks-types";
import * as fs from "fs";

const createGeoStatement = `CREATE TABLE IF NOT EXISTS active_miners (
    miner_id TEXT NOT NULL PRIMARY KEY,
    last_updated INTEGER NOT NULL,
    raw_byte_power BIGINT NOT NULL,
    quality_adj_power BIGINT NOT NULL,
    country TEXT,
    region TEXT,
    city TEXT,
    metro INTEGER,
    latitude REAL,
    longitude REAL,
    radius REAL
)`;
const insertGeoStatement = `INSERT INTO active_miners 
    (miner_id, last_updated, raw_byte_power, quality_adj_power, country, region, city, metro, latitude, longitude, radius) 
VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`;
const createStatement = `CREATE TABLE IF NOT EXISTS current_state (
    deal_id INTEGER NOT NULL PRIMARY KEY,
    piece_cid TEXT NOT NULL,
    piece_size BIGINT NOT NULL,
    verified_deal BOOLEAN NOT NULL,
    client TEXT NOT NULL,
    provider TEXT NOT NULL,
    label TEXT NOT NULL,
    start_epoch INTEGER NOT NULL,
    end_epoch INTEGER NOT NULL,
    storage_price_per_epoch BIGINT NOT NULL,
    provider_collateral BIGINT NOT NULL,
    client_collateral BIGINT NOT NULL,
    sector_start_epoch INTEGER NOT NULL,
    last_updated_epoch INTEGER NOT NULL,
    slash_epoch INTEGER NOT NULL
)`;

const createClientMappingStatement = `CREATE TABLE IF NOT EXISTS client_mapping (
    client TEXT NOT NULL PRIMARY KEY,
    client_address TEXT NOT NULL
)`;

const insertClientMappingStatement = `INSERT INTO client_mapping (client, client_address) VALUES ($1, $2)`;

const insertCurrentStateStatement = `INSERT INTO current_state (
                           deal_id, piece_cid, piece_size, verified_deal, client, 
                           provider, label, start_epoch, end_epoch, storage_price_per_epoch, 
                           provider_collateral, client_collateral, sector_start_epoch,
                           last_updated_epoch, slash_epoch) VALUES 
                                                                ($1, $2, $3, $4, $5, $6, $7, $8, $9,
                                                                 $10, $11, $12, $13, $14, $15)`;

describe('CidChecker', () => {
  let sql: Pool
  let checker: CidChecker
  let issue: Issue

  beforeAll(async () => {
    issue = <any> {
      body: `# Large Dataset Notary Application

To apply for DataCap to onboard your dataset to Filecoin, please fill out the following.

## Core Information
- Organization Name: Some Company Inc
- Website / Social Media: something dot net
- Total amount of DataCap being requested (between 500 TiB and 5 PiB): 5 PiB
- Weekly allocation of DataCap requested (usually between 1-100TiB): 100 TiB
- On-chain address for first allocation: fxxxx1

`, title: '[DataCap Application] My Company - My Project'
    }
    sql = new Pool({
      host: 'localhost',
      user: 'postgres',
      password: 'postgres',
      database: 'postgres',
    })
    checker = new CidChecker(sql, () => {});
    await sql.query("DROP TABLE IF EXISTS current_state");
    await sql.query("DROP TABLE IF EXISTS client_mapping");
    await sql.query("DROP TABLE IF EXISTS active_miners");
    await sql.query(createStatement);
    await sql.query(createClientMappingStatement);
    await sql.query(createGeoStatement);
    await sql.query(insertClientMappingStatement, ['f01000', 'fxxxx1']);
    await sql.query(insertClientMappingStatement, ['f02000', 'fxxxx2']);
    await sql.query(insertClientMappingStatement, ['f03000', 'fxxxx3']);
    let id = 0
    const addDeal = async (client: string, provider: string, piece: string) => {
      await sql.query(insertCurrentStateStatement, [++id, piece, 100, true, client, provider, "", 1, 999999999, 0, 0, 0, 1, 1, -1])
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
      await sql.query(insertGeoStatement, [provider, 0, 0, 0, country, region, city, 0, latitude, longitude, radius])
    }
    await addProvider('provider0', '')
    await addProvider('provider1', 'US,CA,San Francisco')
    await addProvider('provider2', 'US,CA,San Francisco')
    await addProvider('provider3', 'US,OR,Portland')
    await addProvider('provider4', 'US,NY,New York')
    await addProvider('provider5', 'CN,,Beijing')
    await addProvider('provider6', 'UK,,London')
    await addProvider('provider7', 'AU,,Sydney')
  });

  describe('getProjectNameFromTitle', () => {
    it('should return the project name', async () => {
      expect(CidChecker['getProjectNameFromTitle']('')).toEqual('');
      expect(CidChecker['getProjectNameFromTitle']('[DataCap Application] <company>')).toEqual('company');
      expect(CidChecker['getProjectNameFromTitle']('[DataCap Application] <company> - <project>')).toEqual('project');
      expect(CidChecker['getProjectNameFromTitle']('[DataCap Application] <company> - <project>')).toEqual('project');
      expect(CidChecker['getProjectNameFromTitle']('[DataCap Application] project')).toEqual('project');
      expect(CidChecker['getProjectNameFromTitle']('[DataCap Application] company - project')).toEqual('project');
      expect(CidChecker['getProjectNameFromTitle']('company - project')).toEqual('project');
      expect(CidChecker['getProjectNameFromTitle']('project')).toEqual('project');
    })
  })

  describe('getApplicationInfo', () => {
    it('should return the client address', () => {
      const info = CidChecker['getApplicationInfo'](issue)
      expect(info).toEqual({
        clientAddress: 'fxxxx1',
        organizationName: 'Some Company Inc',
        projectName: 'My Project',
      })
    })
  })

  describe('getCidSharing', () => {
    it ('should return the correct cid sharing', async () => {
      const sharing = await checker['getCidSharing']('fxxxx1')
      expect(sharing).toEqual([
        {
          total_deal_size: '200',
          unique_cid_count: 2,
          other_client_address: 'fxxxx3',
        },
        {
          total_deal_size: '100',
          unique_cid_count: 1,
          other_client_address: 'fxxxx2',
        }
      ])
    })
  })

  describe('getReplicationDistribution', () => {
    it('should return the replication distribution', async () => {
      const result = await checker['getReplicationDistribution']('fxxxx1')
      expect(result).toEqual([
          { total_deal_size: '100', num_of_replicas: 1, percentage: 0.1 },
          { total_deal_size: '200', num_of_replicas: 2, percentage: 0.2 },
          { total_deal_size: '300', num_of_replicas: 3, percentage: 0.3 },
          { total_deal_size: '400', num_of_replicas: 4, percentage: 0.4 }
        ]
      )
    })
  })

  describe('getStorageProviderDistribution', () => {
    it('should return the storage provider distribution', async () => {
      const result = await checker['getStorageProviderDistribution']('fxxxx1')
      expect(result).toEqual([
        {
          provider: 'provider0',
          total_deal_size: '400',
          country: '',
          region: null,
          city: null,
          latitude: jasmine.any(Number),
          longitude: jasmine.any(Number),
          percentage: 0.4
        },
        {
          provider: 'provider5',
          total_deal_size: '200',
          country: 'CN',
          region: '',
          city: 'Beijing',
          latitude: jasmine.any(Number),
          longitude: jasmine.any(Number),
          percentage: 0.2
        },
        {
          provider: 'provider1',
          total_deal_size: '100',
          country: 'US',
          region: 'CA',
          city: 'San Francisco',
          latitude: jasmine.any(Number),
          longitude: jasmine.any(Number),
          percentage: 0.1
        },
        {
          provider: 'provider2',
          total_deal_size: '100',
          country: 'US',
          region: 'CA',
          city: 'San Francisco',
          latitude: jasmine.any(Number),
          longitude: jasmine.any(Number),
          percentage: 0.1
        },
        {
          provider: 'provider3',
          total_deal_size: '100',
          country: 'US',
          region: 'OR',
          city: 'Portland',
          latitude: jasmine.any(Number),
          longitude: jasmine.any(Number),
          percentage: 0.1
        },
        {
          provider: 'provider4',
          total_deal_size: '100',
          country: 'US',
          region: 'NY',
          city: 'New York',
          latitude: jasmine.any(Number),
          longitude: jasmine.any(Number),
          percentage: 0.1
        }
      ])
    })
  })
  describe('check', () => {
    it ('should return the markdown content (fake)', async () => {
      const report = await checker.check(issue)
      expect(report).toEqual(fs.readFileSync('tests/checker/example.md', 'utf8'))
      fs.writeFileSync('tests/checker/example.md', report)
    })

    // To enable this test, make sure you have setup correct environment variables
    // PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD
    xit ('should return the markdown content (real)', async () => {
      const checker = new CidChecker(new Pool(), (str: string) => { console.log(str); })
      const report = await checker.check(<any>{
        body:`# Large Dataset Notary Application

To apply for DataCap to onboard your dataset to Filecoin, please fill out the following.

## Core Information
- Organization Name: Some Company Inc
- Website / Social Media: something dot net
- Total amount of DataCap being requested (between 500 TiB and 5 PiB): 5 PiB
- Weekly allocation of DataCap requested (usually between 1-100TiB): 200 TiB
- On-chain address for first allocation: f16ioghg3qy36f6572viouwv4dqow5ejpolo4kodi

`, title: '[DataCap Application] Some Company Inc - Dataset1（1/3）'
      })
      console.log(report)
    })
  })
})
