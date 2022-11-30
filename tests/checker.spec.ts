import checker from "../src/checker/checker";

describe('checker', () => {
  it('should return hello world', () => {
    const result = checker();
    expect(result).toEqual('Hello World!');
  })
})
