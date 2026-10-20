import assert from 'node:assert/strict'
import { test } from 'node:test'
import { resolveDroppedPaths } from './resolve-dropped-paths.ts'

test('resolveDroppedPaths resolves array-like drops in order and names path-less files', () => {
  const note = new File(['# Note'], 'note.md')
  const virtualFile = new File(['text'], 'virtual.txt')
  const folder = new File([], 'folder')
  const page = new File(['<h1>Page</h1>'], 'page.html')
  const files: ArrayLike<File> = {
    0: note,
    1: virtualFile,
    2: folder,
    3: page,
    4: note,
    length: 5
  }
  const paths = new Map([
    [note, '/drop/note.md'],
    [virtualFile, ''],
    [folder, '/drop/folder'],
    [page, '/drop/page.html']
  ])
  const visitedFiles: File[] = []

  const result = resolveDroppedPaths(files, file => {
    visitedFiles.push(file)
    return paths.get(file)!
  })

  assert.deepEqual(result, {
    paths: ['/drop/note.md', '/drop/folder', '/drop/page.html', '/drop/note.md'],
    virtualFileNames: ['virtual.txt']
  })
  assert.deepEqual(visitedFiles, [note, virtualFile, folder, page, note])
})

test('resolveDroppedPaths returns only names when every file has an empty path', () => {
  assert.deepEqual(resolveDroppedPaths([new File([], 'virtual.md')], () => ''), {
    paths: [],
    virtualFileNames: ['virtual.md']
  })
})

test('resolveDroppedPaths returns nothing and does not call the resolver for an empty drop', () => {
  assert.deepEqual(
    resolveDroppedPaths({ length: 0 }, () => {
      assert.fail('An empty drop must not resolve any files')
    }),
    { paths: [], virtualFileNames: [] }
  )
})
