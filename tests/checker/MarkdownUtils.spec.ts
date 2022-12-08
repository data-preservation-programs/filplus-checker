import {
  ColumnConfig,
  generateGfmTable,
  escape,
  generateLink,
  wrapInCode
} from "../../src/checker/MarkdownUtils";

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

    it('should escape markdown code', () => {
      const text = 'my`org'
      const result = wrapInCode(text)
      expect(result).toBe("`my'org`")
    })
  })

  describe('generateLink', () => {
    it('should generate a link', () => {
      const text = 'text'
      const url = 'https://www.github.com/something'
      const result = generateLink(text, url)
      expect(result).toBe('[text](https://www.github.com/something)')
    })

    it('should generate a fake link', () => {
      const text = 'text'
      const url = 'https://www.github.com/something'
      const result = generateLink(text, url, true)
      expect(result).toBe('[text](www.github.com#something)')
    })
  })
})
