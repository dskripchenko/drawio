import { deflateRawSync } from 'node:zlib'
import { approximateMeasurer, base64Decode, decompressPage, DrawioError, htmlLines, inflateRaw, parseDrawio, parseStyle, render } from '../src'
import { fixture } from './fixtures'

const draw = (source: string, options = {}) => render(source, { measureText: approximateMeasurer, ...options })

describe('inflate', () => {
  it('matches zlib on text, repetition and random data', () => {
    const samples = [
      'hello world',
      'abc'.repeat(5000),
      Array.from({ length: 3000 }, (_, i) => String.fromCharCode(32 + ((i * 7919) % 90))).join(''),
      fixture('architecture.drawio'),
    ]
    for (const text of samples) {
      for (const level of [0, 1, 9]) {
        const packed = new Uint8Array(deflateRawSync(Buffer.from(text), { level }))
        expect(new TextDecoder().decode(inflateRaw(packed))).toBe(text)
      }
    }
  })

  it('refuses corrupt data and caps the output', () => {
    expect(() => inflateRaw(new Uint8Array([0xff, 0xff, 0xff]))).toThrow(DrawioError)
    const bomb = new Uint8Array(deflateRawSync(Buffer.alloc(2_000_000)))
    expect(() => inflateRaw(bomb, 1_000_000)).toThrow(/expands beyond 1000000 bytes/)
  })

  it('decodes base64 in both alphabets', () => {
    expect([...base64Decode('aGk/Pw==')]).toEqual([104, 105, 63, 63])
    expect([...base64Decode('aGk_Pw')]).toEqual([104, 105, 63, 63])
    expect(() => base64Decode('a*b')).toThrow(/not valid base64/)
  })

  it('reads a compressed page', () => {
    const xml = '<mxGraphModel><root><mxCell id="0"/></root></mxGraphModel>'
    expect(decompressPage(deflateRawSync(Buffer.from(encodeURIComponent(xml))).toString('base64'))).toBe(xml)
  })
})

describe('parseDrawio', () => {
  it('reads pages, cells, geometry and user objects', () => {
    const file = parseDrawio(fixture('architecture.drawio'))
    expect(file.meta).toMatchObject({ host: 'app.diagrams.net' })
    expect(file.pages.map((p) => p.name)).toEqual(['Architecture', 'Shapes'])
    const page = file.pages[0]!
    expect(page.cells.get('api')).toMatchObject({ parent: 'lane', vertex: true, geometry: { x: 30, y: 60, width: 120, height: 60 } })
    expect(page.cells.get('web')).toMatchObject({ value: '<b>Web app</b><br><font color="#555555">React, Vite</font>', data: { link: 'https://example.com/web', tooltip: 'The customer-facing site' } })
    expect(page.cells.get('e3')!.geometry!.points).toEqual([
      { x: 410, y: 125 },
      { x: 610, y: 125 },
    ])
    expect(page.cells.get('e9')!.geometry!.targetPoint).toEqual({ x: 410, y: 400 })
    expect(page.cells.get('layer2')!.visible).toBe(false)
  })

  it('reads compressed files the same as plain ones', () => {
    const plain = parseDrawio(fixture('architecture.drawio'))
    const packed = parseDrawio(fixture('compressed.drawio'))
    expect(packed.pages.map((p) => [p.name, p.order.length])).toEqual(plain.pages.map((p) => [p.name, p.order.length]))
    expect(draw(fixture('compressed.drawio')).svg.length).toBeGreaterThan(1000)
  })

  it('reads the diagram embedded in an exported SVG', () => {
    const content = fixture('compressed.drawio').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "http://www.w3.org/Graphics/SVG/1.1/DTD/svg11.dtd">\n<svg xmlns="http://www.w3.org/2000/svg" content="${content}"><g/></svg>`
    expect(parseDrawio(svg).pages).toHaveLength(2)
    expect(() => parseDrawio('<svg xmlns="http://www.w3.org/2000/svg"/>')).toThrow(/no draw.io diagram/)
    // An internal subset is never accepted.
    expect(() => parseDrawio('<!DOCTYPE svg [<!ENTITY x "y">]><svg content="a"/>')).toThrow(/Document type declarations/)
  })

  it('parses styles', () => {
    expect(parseStyle('ellipse;whiteSpace=wrap;html=1;fillColor=#fff;')).toEqual({ style: { whiteSpace: 'wrap', html: '1', fillColor: '#fff' }, names: ['ellipse'] })
  })

  it('refuses what is not a draw.io file', () => {
    expect(() => parseDrawio('<html/>')).toThrow(/is not a draw.io file/)
    expect(() => parseDrawio('<mxfile><diagram name="Broken">!!!</diagram></mxfile>')).toThrow(/"Broken" cannot be read/)
  })
})

describe('labels', () => {
  it('turns HTML into styled runs and drops the rest', () => {
    expect(htmlLines('<b>Bold</b> and <i>it</i><br>Second&nbsp;line<div>Third</div>')).toEqual([
      [{ text: 'Bold', bold: true }, { text: ' and ' }, { text: 'it', italic: true }],
      [{ text: 'Second\u00a0line' }],
      [{ text: 'Third' }],
    ])
    expect(htmlLines('<script>alert(1)</script>Safe<img src=x onerror=alert(1)>')).toEqual([[{ text: 'Safe' }]])
    expect(htmlLines('<span style="color: red; font-weight: bold">x</span><font color="javascript:alert(1)">y</font>')).toEqual([
      [{ text: 'x', color: 'red', bold: true }, { text: 'y' }],
    ])
  })
})

describe('render', () => {
  it.each([0, 1])('draws page %i of the fixture as before', async (page) => {
    const result = draw(fixture('architecture.drawio'), { page })
    await expect(result.svg).toMatchFileSnapshot(`./__snapshots__/architecture-${page}.svg`)
  })

  it('reports what it could not draw', () => {
    const shapes = draw(fixture('architecture.drawio'), { page: 'Shapes' })
    expect(shapes.warnings).toEqual(['The image of "ext" is not embedded in the file and is not loaded'])
    expect(draw(fixture('architecture.drawio')).warnings).toEqual(['"mxgraph.aws4.lambda_function" is drawn as a placeholder'])
    expect(shapes.pages).toEqual(['Architecture', 'Shapes'])
    expect(shapes.page).toEqual({ index: 1, id: 'shapes-2', name: 'Shapes' })
  })

  it('loads remote images only when allowed', () => {
    expect(draw(fixture('architecture.drawio'), { page: 1 }).svg).not.toContain('https://example.com/logo.png')
    expect(draw(fixture('architecture.drawio'), { page: 1, allowExternalImages: true }).svg).toContain('href="https://example.com/logo.png"')
    expect(draw(fixture('architecture.drawio'), { page: 1 }).svg).toContain('href="data:image/png;base64,iVBOR')
  })

  it('hides invisible layers', () => {
    expect(draw(fixture('architecture.drawio')).svg).not.toContain('Not shown')
  })

  it('keeps links safe and escapes text', () => {
    const file = (label: string, link: string) =>
      `<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/><UserObject id="a" label="${label}" link="${link}"><mxCell style="html=1;fillColor=red;strokeColor=url(#x);fontFamily=x}body{color:red" vertex="1" parent="1"><mxGeometry x="0" y="0" width="100" height="40" as="geometry"/></mxCell></UserObject></root></mxGraphModel>`
    const bad = draw(file('&lt;svg onload=alert(1)&gt;', 'javascript:alert(1)')).svg
    expect(bad).not.toContain('<svg onload')
    expect(bad).not.toContain('javascript:')
    expect(bad).not.toContain('url(#x)')
    expect(bad).not.toContain('body{')
    const good = draw(file('Docs', 'https://example.com')).svg
    expect(good).toContain('<a href="https://example.com" target="_blank" rel="noopener noreferrer">')
  })

  it('chooses pages by index, id or name', () => {
    expect(draw(fixture('architecture.drawio'), { page: 'shapes-2' }).page.index).toBe(1)
    expect(() => draw(fixture('architecture.drawio'), { page: 'Nope' })).toThrow(/no page "Nope"/)
  })
})
