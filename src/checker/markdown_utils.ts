// @ts-expect-error
import table from 'markdown-table'

export interface ColumnConfig {
  name: string
  align: 'l' | 'c' | 'r'
}

export function generateGfmTable<T> (objects: T[], columeNames: Array<[keyof T, ColumnConfig]>): string {
  const input = []
  input.push(columeNames.map(([, config]) => config.name))
  for (const object of objects) {
    input.push(columeNames.map(([key]) => object[key]))
  }

  return table(input, { align: columeNames.map(([, config]) => config.align) })
}
