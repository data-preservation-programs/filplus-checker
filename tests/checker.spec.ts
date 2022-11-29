import checker from "../src/checker";

describe('checker', () => {
  it('should return hello world', () => {
    const result = checker();
    expect(result).toEqual('Hello World!');
  })
})
