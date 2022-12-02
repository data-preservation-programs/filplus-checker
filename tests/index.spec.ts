import nock from "nock";
import {Probot, ProbotOctokit} from "probot";
import checkerApp from "../src/index";
import payload from './fixtures/comment-created-event.json'
import {setupDatabase} from "./checker/TestSetup";

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

    checkerApp(probot, {})
  })

  it('should post a new comment when triggered', async () => {
    let newComment = ''
    const mock = nock("https://api.github.com")
      .post("/app/installations/2/access_tokens")
      .reply(200, {token: "test"})
      .put(uri => uri.includes("/repos/test-owner/test-name/contents"))
      .twice()
      .reply(201, {content: { "download_url": "https://github.com/test-owner/test-name/blob/main/test.png" }})
      .post("/repos/testuser/cid-checker-bot/issues/1/comments", (body: any) => {
        newComment = body.body
        return true;
      })
      .reply(200);

    await probot.receive({id: '1', name: 'issue_comment', payload: <any>payload.payload});

    if (mock.pendingMocks().length > 0) {
      for (const m of mock.pendingMocks()) {
        console.error(m);
      }
    }

    expect(mock.isDone).toBeTruthy();
    console.log(newComment);
    expect(newComment).toEqual('');
  })

  afterEach(() => {
    nock.cleanAll();
    nock.enableNetConnect();
  });
})
