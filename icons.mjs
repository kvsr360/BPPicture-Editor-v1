const icons = {
 image:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m3 17 5-5 3 3 4-5 6 6"/>',
 camera:'<path d="M4 6h4l2-3h4l2 3h4a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2Z"/><circle cx="12" cy="13" r="4"/>',
 sliders:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2" fill="white"/><circle cx="15" cy="12" r="2" fill="white"/><circle cx="10" cy="18" r="2" fill="white"/>',
 export:'<path d="M12 3v12m-5-5 5 5 5-5M4 15v5h16v-5"/>',
 plus:'<path d="M12 5v14M5 12h14"/>', next:'<path d="M4 12h15m-5-5 5 5-5 5"/>', back:'<path d="M20 12H5m5-5-5 5 5 5"/>',
 crop:'<path d="M7 2v15h15M2 7h15v15"/>',
 mask:'<path d="m12 2 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z"/>',
 preset:'<path d="M6 3h12v18l-6-4-6 4V3Z"/>',
 layers:'<path d="m12 3 10 6-10 6L2 9l10-6ZM2 13l10 6 10-6"/>',
 check:'<path d="m5 12 4 4L19 6"/>', close:'<path d="m6 6 12 12M6 18 18 6"/>',
 help:'<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 0 1 5 0c0 2-2.5 2-2.5 4m0 3h.01"/>',
 undo:'<path d="M9 4 4 9l5 5M4 9h9a6 6 0 0 1 0 12"/>',
 redo:'<path d="m15 4 5 5-5 5m5-5h-9a6 6 0 0 0 0 12"/>',
 trash:'<path d="M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7"/>',
 rotate:'<path d="M5 9a8 8 0 1 1 0 8M5 4v5h5"/>',
 lock:'<rect x="5" y="10" width="14" height="11" rx="3"/><path d="M8 10V7a4 4 0 1 1 8 0v3"/>',
 compare:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 3v18M7 12H5m14 0h-2"/>',
 grid:'<rect x="3" y="3" width="18" height="18" rx="3"/><path d="M3 12h18M12 3v18"/>'
};

export function icon(name) {
  return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] ?? ''}</svg>`;
}
