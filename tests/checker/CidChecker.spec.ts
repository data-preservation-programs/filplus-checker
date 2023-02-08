import CidChecker from "../../src/checker/CidChecker";
import {Issue, IssuesLabeledEvent} from "@octokit/webhooks-types";
import * as fs from "fs";
import {fileUploadConfig, setupDatabase, testDatabase} from "./TestSetup";
import nock from "nock";
import {ProbotOctokit} from "probot";
import {Multiaddr} from "multiaddr";
const logger = require('pino')()

describe('CidChecker', () => {
  let checker: CidChecker
  let issue: Issue
  let event: IssuesLabeledEvent

  beforeAll(async () => {
    checker = new CidChecker(testDatabase, new ProbotOctokit({ auth: {
       token: 'test-token'
      }}), fileUploadConfig, logger, process.env.IPINFO_TOKEN ?? '',1)
    issue = <any>{
      html_url: 'test-url',
      id: 1,
      body: `# Large Dataset Notary Application

To apply for DataCap to onboard your dataset to Filecoin, please fill out the following.

## Core Information
- Organization Name: Some Company Inc
- Website / Social Media: something dot net
- Total amount of DataCap being requested (between 500 TiB and 5 PiB): 5 PiB
- Weekly allocation of DataCap requested (usually between 1-100TiB): 100 TiB
- On-chain address for first allocation: f12345

`, title: '[DataCap Application] My Company - My Project'
    }
    event = <any>{
      issue: issue,
      repository: {
        full_name: 'test-owner/test-repo',
        owner: {
          login: 'test-owner'
        },
        name: 'test-repo'
      }
    }
    await setupDatabase()
  });

  describe('getApplicationInfoLarge', () => {
    it('should return the client address', () => {
      const info = checker['getClientAddress'](issue)
      expect(info).toEqual('f12345')
    })
    it('should find the client issue - bug repro', () => {
      const issue2 = <any>{
        html_url: 'test-url',
        id: 1,
        body: '500TiB\r\n\r\n### On-chain address for first allocation\r\n\r\nf1kyaa43uqypbcsv5isyd4xw7lvgjcumfzqsxag7y\r\n\r\n### Custom multisig',
        title: '[DataCap Application] My Company - My Project'
      }
      const info = checker['getClientAddress'](issue2)
      expect(info).toEqual('f1kyaa43uqypbcsv5isyd4xw7lvgjcumfzqsxag7y')
    })
  })

  describe('getCidSharing', () => {
    it('should return the correct cid sharing', async () => {
      const sharing = await checker['getCidSharing'](['f12345'])
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
      const result = await checker['getReplicationDistribution'](['f12345'])
      expect(result).toEqual([
          {
            total_deal_size: '700',
            unique_data_size: '300',
            num_of_replicas: 1,
            percentage: 0.7
          },
          {
            total_deal_size: '300',
            unique_data_size: '100',
            num_of_replicas: 3,
            percentage: 0.3
          }
        ]
      )
    })
  })

  describe('getStorageProviderDistribution', () => {
    it('should return the storage provider distribution', async () => {
      const result = await checker['getStorageProviderDistribution'](['f12345'])
      expect(result).toEqual([
        {
          provider: 'provider0',
          total_deal_size: '400',
          percentage: 0.4,
          duplication_percentage: 0.75,
          unique_data_size: '100',
        },
        {
          provider: 'provider5',
          total_deal_size: '200',
          percentage: 0.2,
          duplication_percentage: 0.5,
          unique_data_size: '100',
        },
        {
          provider: 'provider1',
          total_deal_size: '100',
          percentage: 0.1,
          duplication_percentage: 0,
          unique_data_size: '100',
        },
        {
          provider: 'provider2',
          total_deal_size: '100',
          percentage: 0.1,
          duplication_percentage: 0,
          unique_data_size: '100',
        },
        {
          provider: 'provider3',
          total_deal_size: '100',
          percentage: 0.1,
          duplication_percentage: 0,
          unique_data_size: '100',
        },
        {
          provider: 'provider4',
          total_deal_size: '100',
          percentage: 0.1,
          duplication_percentage: 0,
          unique_data_size: '100',
        }
      ])
    })
  })

  describe('getIpFromMultiaddr', () => {
    it('should return the ip for ipv4', async () => {
      const multiaddr = Buffer.from(new Multiaddr('/ip4/1.1.1.1/tcp/1234').bytes).toString('base64');
      const address = checker['getIpFromMultiaddr'](multiaddr);
      expect(await address).toEqual(['1.1.1.1']);
    })
  })

  describe('getMinerInfo', () => {
    it('should return miner details', async () => {
      const minerInfo = await checker['getMinerInfo']('f064218');
      expect(minerInfo).toEqual(jasmine.objectContaining({
        PeerId: '12D3KooWKjMeR4zo5dbDdmuVNBPoYUp11jbh6RuPXqge7MQZykZt',
        Multiaddrs: ['Ngx4eGEuZGRucy5uZXQGXcE='],
        SectorSize: 34359738368
      }));
    });
  })

  describe('getLocation', () => {
    xit('should return the location', async () => {
      const location = await checker['getLocation']('f01974746')
      expect(location).toBeNull()
    })
    xit('should return the location', async () => {
      const location = await checker['getLocation']('f01887652')
      expect(location).toEqual({ city: 'Ashburn', country: 'US', region: 'Virginia', latitude: 39.0437, longitude: -77.4875, orgName: 'Amazon.com, Inc.' })
    })
  })

  describe('findApplicationInfoForClient', () => {
    afterEach(() => {
      nock.cleanAll();
      nock.enableNetConnect();
    });
    beforeAll( () => {
      nock.disableNetConnect();
    })
    it('should return the application info', async () => {
      const mock1 = nock("https://api.filplus.d.interplanetary.one")
        .get(_ => true)
        .reply(200, {
          "count":"2","data":[
            {
              "address": "address1",
              "orgName": "Org Name",
              "initialAllowance": "1000",
              "verifierName": "LDN v3 multisig",
              "allowanceArray": [{
                "id": 1,
                "auditTrail": "https://github.com/filecoin-project/filecoin-plus-large-datasets/issues/xxx"
              }]
            },
            {
              "address": "address1",
              "orgName": "Org Name",
              "initialAllowance": "2000",
              "verifierName": "LDN v3 multisig",
              "allowanceArray": [{
                "id": 1,
                "auditTrail": "https://github.com/filecoin-project/filecoin-plus-large-datasets/issues/xxx"
              }]
            }]
        })
      const applicationInfo = await checker['findApplicationInfoForClient']('address1')
      expect(applicationInfo).toEqual({
        clientAddress: 'address1',
        verifier: 'LDN v3 multisig',
        organizationName: 'Org Name',
        url: 'https://github.com/filecoin-project/filecoin-plus-large-datasets/issues/xxx',
        issueNumber: 'xxx',
      })
      if (mock1.pendingMocks().length > 0) {
        console.error(mock1.pendingMocks())
      }
      expect(mock1.isDone()).toBeTruthy();
    })
  })
  describe('getErrorContent', () => {
    it('should return the error template', async () => {
      const content = CidChecker['getErrorContent']('test message')
      //fs.writeFileSync('tests/fixtures/error.md', content)
      expect(content).toEqual(fs.readFileSync('tests/fixtures/error.md', 'utf8'))
    })
  })

  describe('check', () => {
    afterEach(() => {
      nock.cleanAll();
      nock.enableNetConnect();
    });
    beforeAll( () => {
      nock.disableNetConnect();
    })
    it('should return the markdown content (fake)', async () => {
      const issue2 = JSON.parse(JSON.stringify(issue))
      issue2.body = issue2.body.replace('f12345', 'fxxxx2')
      issue2.title = issue2.title.replace('My Project', 'My Project2')
      const issue3 = JSON.parse(JSON.stringify(issue))
      issue3.body = issue3.body.replace('f12345', 'fxxxx3')
      issue3.title = issue3.title.replace('My Project', 'My Project3')

      const mock1 = nock("https://api.github.com")
        .get(uri => uri.includes("comments"))
        .reply(200, [{body: '## Request Approved', user: { login: 'user1' }},
          {body: '## Request Approved', user: { login: 'user2' }},
          {body: '## Request Approved', user: { login: 'user3' }},
          {body: '## DataCap Allocation requested', user: { login: 'bot', id: 1 }}])
        .get(uri => uri.includes("comments"))
        .reply(200, [{body: '## Request Approved', user: { login: 'usera' }},
          {body: '## Request Approved', user: { login: 'userb' }},
          {body: '## Request Approved', user: { login: 'userc' }}])
        .get(uri => uri.includes("comments"))
        .reply(200, [{body: '## Request Approved', user: { login: 'userx' }},
          {body: '## Request Approved', user: { login: 'usery' }},
          {body: '## Request Approved', user: { login: 'userz' }}])
        .put(uri => uri.includes("/repos/test-owner/test-repo/contents"))
        .reply(201, {content: { "download_url": "./provider.png" }})
        .put(uri => uri.includes("/repos/test-owner/test-repo/contents"))
        .reply(201, {content: { "download_url": "./replica.png" }})
        .put(uri => uri.includes("/repos/test-owner/test-repo/contents"))
        .reply(201, {content: { "download_url": "./report.md" }})
      spyOn<any>(checker, 'findApplicationInfoForClient').and.returnValues(
        Promise.resolve({
          organizationName: 'org1',
          clientAddress: 'f12345',
          verifier: 'verifier1',
          url: 'url1',
          issueNumber: '1'
        }),
        Promise.resolve({
          organizationName: 'org2',
          clientAddress: 'fxxxx3',
          verifier: 'verifier2',
          url: 'url2',
          issueNumber: '2'
        }),
        Promise.resolve({
          organizationName: 'org3',
          clientAddress: 'fxxxx2',
          verifier: 'verifier3',
          url: 'url3',
          issueNumber: '3'
        }))
      spyOn<any>(checker, 'getLocation').and.returnValues(
        Promise.resolve(null),
        Promise.resolve(null),
        Promise.resolve({
          city: 'city1',
          country: 'US',
          region: 'region1',
          latitude: 39.0437,
          longitude: -77.4875
        }),
        Promise.resolve({
          city: 'city2',
          country: 'US',
          region: 'region2',
          latitude: 39.0437,
          longitude: -77.4875
        }),
        Promise.resolve({
          city: 'city3',
          country: 'US',
          region: 'region3',
          latitude: 39.0437,
          longitude: -77.4875
        }),
        Promise.resolve({
          city: 'city4',
          country: 'US',
          region: 'region4',
          latitude: 39.0437,
          longitude: -77.4875
        }),)
      const report = await checker.check(event, [{
        maxProviderDealPercentage: 0.25,
        maxDuplicationPercentage: 0.20,
        maxPercentageForLowReplica: 0.25,
        lowReplicaThreshold: 3
      }], ['fxxxx2'])
      if (mock1.pendingMocks().length > 0) {
        console.error(mock1.pendingMocks())
      }
      //fs.writeFileSync('tests/fixtures/expected.md', report!)
      //expect(mock1.isDone()).toBeTruthy();
      expect(report).toEqual(fs.readFileSync('tests/fixtures/expected.md', 'utf8'))
    })
  })
})
