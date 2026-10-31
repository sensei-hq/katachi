// Hands a file the app made (a sheet's SVG or DXF, a zip of them) to the browser's download. Presentation only:
// the bytes come from state; nothing is fetched.
export function saveFile(name: string, mime: string, data: string | Uint8Array) {
  const blob = new Blob([typeof data === 'string' ? data : new Uint8Array(data)], { type: mime });
  const url = URL.createObjectURL(blob), a = document.createElement('a');
  a.href = url; a.download = name; a.rel = 'noopener';
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
