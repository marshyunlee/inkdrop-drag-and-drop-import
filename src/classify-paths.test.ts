import assert from 'node:assert/strict'
import { test } from 'node:test'
import { classifyPaths } from './classify-paths.ts'
import type { StatFunction } from './types.ts'

function createStatFunction(
  pathKinds: Record<string, 'file' | 'directory' | 'other' | Error>
): StatFunction {
  return path => {
    const kind = pathKinds[path]
    if (kind === undefined) throw new Error(`Missing path: ${path}`)
    if (kind instanceof Error) throw kind
    return {
      isDirectory: () => kind === 'directory',
      isFile: () => kind === 'file'
    }
  }
}

for (const extension of ['.md', '.MD', '.txt', '.TXT', '.Txt']) {
  test(`classifyPaths routes ${extension} files to Markdown`, () => {
    const path = `/drop/note${extension}`
    assert.deepEqual(classifyPaths([path], createStatFunction({ [path]: 'file' })), {
      markdown: [path],
      html: [],
      unsupported: [],
      isFolderOnly: false
    })
  })
}

for (const extension of ['.html', '.HTML', '.htm', '.HTM']) {
  test(`classifyPaths routes ${extension} files to HTML`, () => {
    const path = `/drop/page${extension}`
    assert.deepEqual(classifyPaths([path], createStatFunction({ [path]: 'file' })), {
      markdown: [],
      html: [path],
      unsupported: [],
      isFolderOnly: false
    })
  })
}

test('classifyPaths routes directories to Markdown regardless of extension', () => {
  const paths = ['/drop/folder', '/drop/folder.html', '/drop/folder-link']
  // fs.statSync follows symlinks, so a folder symlink has the directory result modeled here.
  const stat = createStatFunction({
    '/drop/folder': 'directory',
    '/drop/folder.html': 'directory',
    '/drop/folder-link': 'directory'
  })

  assert.deepEqual(classifyPaths(paths, stat), {
    markdown: paths,
    html: [],
    unsupported: [],
    isFolderOnly: true
  })
})

test('classifyPaths classifies a file symlink by the link name, not the target', () => {
  // fs.statSync reports the target's kind; the extension still comes from the dropped path.
  const stat = createStatFunction({ '/drop/notes': 'file', '/drop/x.md': 'file' })

  assert.deepEqual(classifyPaths(['/drop/notes', '/drop/x.md'], stat), {
    markdown: ['/drop/x.md'],
    html: [],
    unsupported: ['/drop/notes'],
    isFolderOnly: false
  })
})

test('classifyPaths rejects unsupported extensions, missing paths, stat errors and special files', () => {
  const paths = [
    '/drop/picture.png',
    '/drop/report.pdf',
    '/drop/README',
    '/drop/.md',
    '/drop/missing.md',
    '/drop/denied.html',
    '/drop/socket.md'
  ]
  const stat = createStatFunction({
    '/drop/picture.png': 'file',
    '/drop/report.pdf': 'file',
    '/drop/README': 'file',
    '/drop/.md': 'file',
    '/drop/denied.html': new Error('Permission denied'),
    '/drop/socket.md': 'other'
  })

  assert.deepEqual(classifyPaths(paths, stat), {
    markdown: [],
    html: [],
    unsupported: paths,
    isFolderOnly: false
  })
})

test('classifyPaths preserves mixed drop order and duplicates within each bucket', () => {
  const paths = [
    '/drop/first.htm',
    '/drop/folder',
    '/drop/image.png',
    '/drop/second.md',
    '/drop/first.htm',
    '/drop/third.HTML',
    '/drop/folder',
    '/drop/missing',
    '/drop/second.md',
    '/drop/image.png'
  ]
  const stat = createStatFunction({
    '/drop/first.htm': 'file',
    '/drop/folder': 'directory',
    '/drop/image.png': 'file',
    '/drop/second.md': 'file',
    '/drop/third.HTML': 'file'
  })

  assert.deepEqual(classifyPaths(paths, stat), {
    markdown: ['/drop/folder', '/drop/second.md', '/drop/folder', '/drop/second.md'],
    html: ['/drop/first.htm', '/drop/first.htm', '/drop/third.HTML'],
    unsupported: ['/drop/image.png', '/drop/missing', '/drop/image.png'],
    isFolderOnly: false
  })
})

test('classifyPaths considers only Markdown entries when computing isFolderOnly', () => {
  const paths = ['/drop/folder', '/drop/page.html', '/drop/missing', '/drop/folder']
  const stat = createStatFunction({
    '/drop/folder': 'directory',
    '/drop/page.html': 'file'
  })

  assert.deepEqual(classifyPaths(paths, stat), {
    markdown: ['/drop/folder', '/drop/folder'],
    html: ['/drop/page.html'],
    unsupported: ['/drop/missing'],
    isFolderOnly: true
  })
})

test('classifyPaths returns empty buckets and isFolderOnly false for an empty drop', () => {
  assert.deepEqual(classifyPaths([], createStatFunction({})), {
    markdown: [],
    html: [],
    unsupported: [],
    isFolderOnly: false
  })
})
