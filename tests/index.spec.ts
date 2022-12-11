import nock from "nock";
import {Probot, ProbotOctokit} from "probot";
import handler from "../src/app";
import * as dependency from "../src/Dependency";
import {setupDatabase} from "./checker/TestSetup";
import * as event from "./fixtures/issue-labelled.json";

describe('checkerApp', () => {
  let probot: Probot;
  beforeEach(async () => {
    await setupDatabase()
    process.env.UPLOAD_TOKEN = 'test-token';
    process.env.UPLOAD_REPO_OWNER = 'test-owner';
    process.env.UPLOAD_REPO_NAME = 'test-name';
    process.env.UPLOAD_REPO_COMMITTER_NAME = 'test-username';
    process.env.UPLOAD_REPO_COMMITTER_EMAIL = 'test-email';
    nock.disableNetConnect();
    probot = new Probot({
      githubToken: 'test',
      Octokit: ProbotOctokit.defaults({
        retry: {enabled: false},
        throttle: {enabled: false},
      })
    });

    handler(probot, {})
  })

  it('should post a new comment when triggered', async () => {
    let newComment = ''
    const mock = nock("https://api.github.com")
      .post("/repos/data-preservation-programs/filecoin-plus-large-datasets/issues/1/comments", (body: any) => {
        newComment = body.body
        return true;
      })
      .reply(200);

    const mockChecker = jasmine.createSpyObj('CidChecker', { check: Promise.resolve('test-content') });
    spyOn(dependency, 'getCidChecker').and.returnValue(mockChecker)
    process.env.TARGET_LABEL = 'bot:readyToSign'
    process.env.CRITERIA = '[{"lowReplicaThreshold": 1, "maxDuplicationPercentage": 1, "maxProviderDealPercentage": 1, "maxPercentageForLowReplica": 1}]'
    await probot.receive({id: '1', name: 'issues', payload: <any> event.payload});

    if (mock.pendingMocks().length > 0) {
      console.error(mock.pendingMocks())
    }
    expect(mock.isDone()).toBeTruthy();
    expect(newComment).toEqual('test-content');
  })

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
})
