import { describe, expect, it } from 'vitest'
import { actorColumn, actorsCovered, actorsSpan, entrySteps, ids, messageGeometry, stateCells } from '../../packages/schemas/src/runtime/sequence-grid.ts'

const actors = ['r', 'c', 'a', 'b']

describe('ids', () => {
  it('reads a comma-separated list, without its spaces and its empty entries', () => {
    expect(ids(' a, b,,c ')).toEqual(['a', 'b', 'c'])
    expect(ids()).toEqual([])
  })
})

describe('actorColumn', () => {
  it('places the participants after the margin column, in writing order', () => {
    expect(actorColumn(actors, 'r')).toBe(2)
    expect(actorColumn(actors, 'b')).toBe(5)
    expect(actorColumn(actors, 'x')).toBeUndefined()
  })
})

describe('actorsSpan', () => {
  it('spans from the first to the last participant named, in any order', () => {
    expect(actorsSpan(actors, 'a,c')).toBe('3 / 5')
  })

  it('spans every participant when none is named', () => {
    expect(actorsSpan(actors)).toBe('2 / 6')
  })
})

describe('actorsCovered', () => {
  it('names every participant from the first to the last named, those in between included', () => {
    expect(actorsCovered(actors, 'a,r')).toEqual(['r', 'c', 'a'])
  })

  it('names every participant when none is named', () => {
    expect(actorsCovered(actors)).toEqual(actors)
  })
})

describe('messageGeometry', () => {
  it('runs from the middle of the sender column to the middle of the receiver column', () => {
    expect(messageGeometry(actors, 'r', 'c')).toEqual({ gridColumn: '2 / 4', left: 25, right: 25, middle: 50, head: 75, reverse: false, dots: [25] })
  })

  it('points left when the receiver stands before the sender, with a dot on each participant it goes through', () => {
    const geometry = messageGeometry(actors, 'b', 'c', 'a')
    expect(geometry).toMatchObject({ gridColumn: '3 / 6', reverse: true })
    expect(geometry?.head).toBeCloseTo(100 / 6)
    expect(geometry?.dots.map(d => Math.round(d))).toEqual([83, 50])
  })

  it('draws nothing for an id that names no participant', () => {
    expect(messageGeometry(actors, 'r', 'x')).toBeUndefined()
  })
})

describe('stateCells', () => {
  it('puts each value on the column of its participant and leaves out the unknown ids', () => {
    expect(stateCells(actors, 'c=Draft | x=Lost | b=Sent', { colored: false })).toEqual([
      { id: 'c', column: 3, value: 'Draft', marked: false },
      { id: 'b', column: 5, value: 'Sent', marked: false },
    ])
  })

  it('frames the values mark names, or all of them, once the state has a color', () => {
    expect(stateCells(actors, 'c=Draft|b=Sent', { colored: true, mark: 'c' }).map(cell => cell.marked)).toEqual([true, false])
    expect(stateCells(actors, 'c=Draft|b=Sent', { colored: true }).map(cell => cell.marked)).toEqual([true, true])
  })

  it('gives no value to a state without `values`', () => {
    expect(stateCells(actors, undefined, { colored: false })).toEqual([])
  })
})

describe('entrySteps', () => {
  it('brings each participant in with the first row that names it, after those of the first row', () => {
    const rows = [
      { step: '0', actors: ['r', 'c'] },
      { step: '1', actors: ['k', 'a', 'b'] },
      { step: '2', actors: ['r', 'a', 'b'] },
    ]
    expect([...entrySteps(rows)]).toEqual([['k', '1'], ['a', '1'], ['b', '1']])
  })
})
