/** What a child of a `Columns` block is, for the rule that splits the block into columns. */
export type ColumnPart = 'column' | 'rule' | 'heading' | 'other'

/**
 * The columns of a `Columns` block whose children are not already its
 * columns: none when it holds two `Column` blocks or more, which are its
 * columns. Otherwise the block splits at its first horizontal rule, or else
 * before each `###` or `####` heading; a block that gives fewer than two
 * columns stays whole, and the function returns none.
 */
export function columnGroups<T>(children: readonly T[], partOf: (child: T) => ColumnPart): T[][] | undefined {
  if (children.filter(child => partOf(child) === 'column').length >= 2)
    return undefined
  const rule = children.findIndex(child => partOf(child) === 'rule')
  const groups: T[][] = []
  if (rule !== -1) {
    groups.push(children.slice(0, rule), children.slice(rule + 1))
  }
  else {
    for (const child of children) {
      if (partOf(child) === 'heading' && groups.at(-1)?.length)
        groups.push([])
      if (!groups.length)
        groups.push([])
      groups.at(-1)!.push(child)
    }
  }
  return groups.length >= 2 ? groups : undefined
}
