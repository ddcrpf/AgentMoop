import { expect, test } from 'claude-code/testing'

import { filenameProblem, mediaTypeFor, NAME_REFUSED, parseShare } from './share'

test('parses @tag text and dragged paths with spaces, quotes and ~', () => {
  expect(parseShare('@Logan404 check this out', '/Users/p')).toEqual({ tag: 'logan404', body: 'check this out', paths: [] })
  expect(parseShare('@logan404 check this /Users/p/Desktop/Screenshot\\ 2026-10-17\\ at\\ 1.23.45\\ PM.png', '/Users/p'))
    .toEqual({ tag: 'logan404', body: 'check this', paths: ['/Users/p/Desktop/Screenshot 2026-10-17 at 1.23.45 PM.png'] })
  expect(parseShare("@logan404 '/Users/p/My Shots/a.png' look", '/Users/p')).toEqual({ tag: 'logan404', body: 'look', paths: ['/Users/p/My Shots/a.png'] })
  expect(parseShare('@logan404 ~/Desktop/notes.md', '/Users/p')).toEqual({ tag: 'logan404', body: '', paths: ['/Users/p/Desktop/notes.md'] })
  expect(parseShare('hey @logan404', '/Users/p')).toBeNull()
  expect(parseShare('@logan404 see /etc/hosts', '/Users/p')).toEqual({ tag: 'logan404', body: 'see /etc/hosts', paths: [] })
  expect(mediaTypeFor('/a/b.JPG')).toBe('image/jpeg')
  expect(mediaTypeFor('/a/b.gif')).toBeNull()
})

test('keeps a ~ path as text when the home directory is unknown', () => {
  expect(parseShare('@logan404 ~/notes.md', '')).toEqual({ tag: 'logan404', body: '~/notes.md', paths: [] })
  expect(parseShare('@ab hi', '/Users/p')).toBeNull()
})

test('keeps trailing punctuation in the words, not the path', () => {
  expect(parseShare('@logan404 look /a/b.png.', '/Users/p')).toEqual({ tag: 'logan404', body: 'look.', paths: ['/a/b.png'] })
  expect(parseShare('@logan404 look /a/b.png, ok', '/Users/p')).toEqual({ tag: 'logan404', body: 'look, ok', paths: ['/a/b.png'] })
  expect(parseShare('@logan404 (see /a/b.md)', '/Users/p')).toEqual({ tag: 'logan404', body: '(see)', paths: ['/a/b.md'] })
})

test('reads a macOS screenshot name with its narrow no-break space', () => {
  const nnbsp = String.fromCharCode(0x202f)
  expect(parseShare(`@logan404 /Users/p/Desktop/Screenshot\\ 2026-10-17\\ at\\ 1.23.45${nnbsp}PM.png`, '/Users/p'))
    .toEqual({ tag: 'logan404', body: '', paths: [`/Users/p/Desktop/Screenshot 2026-10-17 at 1.23.45${nnbsp}PM.png`] })
})

test('takes a path only at the start of a word', () => {
  expect(parseShare('@logan404 see https://x.com/a.png', '/Users/p')).toEqual({ tag: 'logan404', body: 'see https://x.com/a.png', paths: [] })
  expect(parseShare('@logan404 edit foo/bar.md please', '/Users/p')).toEqual({ tag: 'logan404', body: 'edit foo/bar.md please', paths: [] })
  expect(parseShare('@logan404 C:/Users/a.png', '/Users/p')).toEqual({ tag: 'logan404', body: 'C:/Users/a.png', paths: [] })
})

test('unescapes any backslash-escaped character in a dragged path', () => {
  expect(parseShare('@logan404 /Users/p/image\\ \\(1\\).png', '/Users/p')).toEqual({ tag: 'logan404', body: '', paths: ['/Users/p/image (1).png'] })
})

test('refuses file names the server would refuse', () => {
  expect(filenameProblem('/a/shot.png')).toBeNull()
  for (const bad of ['/a/.hidden.png', '/a/png', '/a/x:y.png', '/a/x\\y.png', '/a/shot.png.', `/a/${'x'.repeat(117)}.png`, `/a/a${String.fromCharCode(0x202e)}b.png`]) {
    expect(filenameProblem(bad), bad).toBe(NAME_REFUSED)
  }
})
