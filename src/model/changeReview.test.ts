import { describe, expect, it } from 'vitest'
import { buildChangeReview, pairReviewLines } from './changeReview'

describe('保存前的完整差异', () => {
  it.each([
    ['', ''],
    ['', '新增\n'],
    ['删除\n', ''],
    ['同一行\n', '同一行'],
    ['a\r\nb\r\n', 'a\nb\n'],
    ['\n\n正文  \n', '\n正文\t\n'],
    ['日记 👩‍💻 与心情\n\n继续', '日记 🌤️ 与想法\n\n继续\n'],
    ['a\nb\nc\nd\n', 'a\nc\nb\nd\n'],
  ])('每一侧都可逐字重建 %j → %j', (before, after) => {
    const review = buildChangeReview(before, after)
    expect(
      review.rows
        .filter((row) => row.kind !== 'added')
        .map((row) => row.text + row.ending)
        .join(''),
    ).toBe(before)
    expect(
      review.rows
        .filter((row) => row.kind !== 'removed')
        .map((row) => row.text + row.ending)
        .join(''),
    ).toBe(after)
    const displayedChanges = review.hunks
      .flatMap((hunk) => hunk.rows)
      .filter((row) => row.kind !== 'context')
    expect(displayedChanges).toEqual(review.rows.filter((row) => row.kind !== 'context'))
  })

  it('相隔很远的修改各自展示，未改动的行数准确', () => {
    const before = Array.from({ length: 200 }, (_, i) => `第${i + 1}行\n`).join('')
    const after = before.replace('第15行', '第一次修改').replace('第178行', '另一次修改')
    const review = buildChangeReview(before, after)
    expect(review.hunks).toHaveLength(2)
    expect(review.added).toBe(2)
    expect(review.removed).toBe(2)
    expect(
      review.hunks.reduce(
        (sum, hunk) => sum + hunk.rows.length + hunk.hiddenBefore,
        review.hiddenAfter,
      ),
    ).toBe(review.rows.length)
  })

  it('中文和表情的行内高亮不破坏原文，增加与删除均可辨认', () => {
    const review = buildChangeReview('今天开心🌼\n', '今天平静🌻\n')
    for (const row of review.rows)
      expect(row.emphasis?.map((part) => part.text).join('')).toBe(row.text)
    expect(review.rows[0]!.emphasis?.some((part) => part.changed)).toBe(true)
    expect(review.rows[1]!.emphasis?.some((part) => part.changed)).toBe(true)
  })

  it('任意 YAML 扩展、附件路径与正文变化均出现在对照中', () => {
    const before =
      '---\nformat: chatlog-md/2\nx-custom: old\n---\n\n# @2026-09-20\n\n## 🧑‍💻 @user\n\n旧正文\n'
    const after = before
      .replace('x-custom: old', 'x-custom: new')
      .replace('旧正文', '新正文\n\n![图片](assets/new.png)')
    const review = buildChangeReview(before, after)
    const displayed = review.hunks
      .flatMap((hunk) => hunk.rows)
      .map((row) => row.text)
      .join('\n')
    expect(displayed).toContain('x-custom: old')
    expect(displayed).toContain('x-custom: new')
    expect(displayed).toContain('assets/new.png')
    expect(review.hunks.some((hunk) => hunk.title.includes('我的记录'))).toBe(true)
  })

  it('并排布局不会丢行，也不会把删除行重复成新增行', () => {
    const rows = buildChangeReview('a\nb\nc\nd\ne\n', 'a\nx\ne\ny\n').rows
    const pairs = pairReviewLines(rows)
    expect(pairs.flatMap((pair) => (pair.before ? [pair.before] : []))).toEqual(
      rows.filter((row) => row.kind !== 'added'),
    )
    expect(pairs.flatMap((pair) => (pair.after ? [pair.after] : []))).toEqual(
      rows.filter((row) => row.kind !== 'removed'),
    )
  })

  it('相邻记录合并成同一区块时，汇总每条记录的字段变化', () => {
    const before =
      '---\nformat: chatlog-md/2\n---\n\n# @2026-09-20\n\n## 🧑‍💻 @user\n\n旧正文\n\n## 🤖 @ai\n<!-- @meta\nmood: 原心情\n-->\n\n另一条记录\n'
    const after = before.replace('旧正文', '新正文').replace('原心情', '新心情')
    const review = buildChangeReview(before, after)
    expect(review.hunks).toHaveLength(1)
    expect(review.hunks[0]!.fields).toEqual(expect.arrayContaining(['正文', '心情']))
    expect(review.hunks[0]!.fields).not.toContain('过程')
    expect(review.hunks[0]!.fields).not.toContain('其他信息')
  })
})
