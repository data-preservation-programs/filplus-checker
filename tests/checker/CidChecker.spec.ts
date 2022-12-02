import CidChecker from "../../src/checker/CidChecker";
import {Issue, IssueCommentCreatedEvent} from "@octokit/webhooks-types";
import * as fs from "fs";
import {fileUploadConfig, setupDatabase, testDatabase} from "./TestSetup";
import nock from "nock";
import {ProbotOctokit} from "probot";

describe('CidChecker', () => {
  let checker: CidChecker
  let issue: Issue
  let event: IssueCommentCreatedEvent

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });

  beforeAll(async () => {
    await setupDatabase()
    nock.disableNetConnect();
    checker = new CidChecker(testDatabase, new ProbotOctokit({ auth: {
       token: 'test-token'
      }}), fileUploadConfig, (str) => {
      console.log(str)
    })
    issue = <any>{
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
        full_name: 'testowner/testrepo'
      }
    }
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
        clientAddress: 'f12345',
        organizationName: 'Some Company Inc',
        projectName: 'My Project',
      })
    })
  })

  describe('getCidSharing', () => {
    it('should return the correct cid sharing', async () => {
      const sharing = await checker['getCidSharing']('f12345')
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
      const result = await checker['getReplicationDistribution']('f12345')
      expect(result).toEqual([
          {total_deal_size: '100', num_of_replicas: 1, percentage: 0.1},
          {total_deal_size: '200', num_of_replicas: 2, percentage: 0.2},
          {total_deal_size: '300', num_of_replicas: 3, percentage: 0.3},
          {total_deal_size: '400', num_of_replicas: 4, percentage: 0.4}
        ]
      )
    })
  })

  describe('getStorageProviderDistribution', () => {
    it('should return the storage provider distribution', async () => {
      const result = await checker['getStorageProviderDistribution']('f12345')
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
    it('should return the markdown content (fake)', async () => {
      const mock = nock("https://api.github.com")
        .put(uri => uri.includes("/repos/test-owner/test-repo/contents"))
        .reply(201, {content: { "download_url": "./provider.png" }})
        .put(uri => uri.includes("/repos/test-owner/test-repo/contents"))
        .reply(201, {content: { "download_url": "./replica.png" }});
      const report = await checker.check(event)
      expect(mock.isDone()).toBeTruthy()
      // fs.writeFileSync('tests/fixtures/expected.md', report)
      expect(report).toEqual(fs.readFileSync('tests/fixtures/expected.md', 'utf8'))
    })
  })
})
