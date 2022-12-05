import {ColumnConfig, generateGfmTable, escape} from "../../src/checker/markdown_utils";

describe('MarkdownUtils', () => {
  describe('generateGfmTable', () => {
    it('should generate a GFM table', () => {
      const objects = [
        {
          name: 'foo',
          age: 10
        },
        {
          name: 'bar',
          age: 20
        }
      ]
      const columeNames: Array<[keyof typeof objects[0], ColumnConfig]> = [
        ['name', {name: 'Name', align: 'l'}],
        ['age', {name: 'Age', align: 'r'}]
      ]
      const result = generateGfmTable(objects, columeNames)
      expect(result).toBe(`| Name | Age |
| :--- | --: |
| foo  |  10 |
| bar  |  20 |`)
    })
  })

  describe('escape', () => {
    it('should escape markdown characters', () => {
      const text = '\\`*_{}[]<>()#+-.!|'
      const result = escape(text)
      expect(result).toBe('\\\\\\`\\*\\_\\{\\}\\[\\]\\<\\>\\(\\)\\#\\+\\-\\.\\!\\|')
    })
  })
})
