import * as THREE from "three";

/** Génère une texture de texte (canvas 2D) : aucune police distante, aucun appel réseau. */
export function makeLabelTexture(text: string, opts: { sub?: string; color?: string; background?: string; accent?: string } = {}) {
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d")!;
  const font = "600 44px Inter Variable, Inter, system-ui, sans-serif";
  const subFont = "400 30px Inter Variable, Inter, system-ui, sans-serif";
  ctx.font = font;
  const w1 = ctx.measureText(text).width;
  ctx.font = subFont;
  const w2 = opts.sub ? ctx.measureText(opts.sub).width : 0;
  const width = Math.ceil(Math.min(900, Math.max(w1, w2) + 56));
  const height = opts.sub ? 120 : 76;
  canvas.width = width;
  canvas.height = height;
  ctx.fillStyle = opts.background ?? "rgba(10,14,26,0.92)";
  const r = 18;
  ctx.beginPath();
  ctx.roundRect(0, 0, width, height, r);
  ctx.fill();
  if (opts.accent) {
    ctx.fillStyle = opts.accent;
    ctx.beginPath();
    ctx.roundRect(0, 0, 10, height, [r, 0, 0, r]);
    ctx.fill();
  }
  ctx.fillStyle = opts.color ?? "#f8fafc";
  ctx.font = font;
  ctx.textBaseline = "top";
  ctx.fillText(text, 28, 14, width - 40);
  if (opts.sub) {
    ctx.fillStyle = "rgba(226,232,240,0.92)";
    ctx.font = subFont;
    ctx.fillText(opts.sub, 28, 70, width - 40);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  return { texture, aspect: width / height };
}

export type ScreenChart = { title: string; labels: string[]; values: number[]; kind: "bars" | "line"; format: "money" | "number" };

const compact = (v: number, format: ScreenChart["format"]) =>
  format === "money" ? new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(v) + " €" : String(Math.round(v));

/** Texture d'écran d'indicateurs (titre + métriques, et mini-graphique sur 6 mois si fourni). */
export function makeScreenTexture(title: string, metrics: { label: string; value: string }[], accent: string, chart?: ScreenChart) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 400;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createLinearGradient(0, 0, 0, 400);
  g.addColorStop(0, "#111827");
  g.addColorStop(1, "#0b1020");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 640, 400);
  ctx.fillStyle = accent;
  ctx.fillRect(0, 0, 640, 10);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "700 40px Inter Variable, Inter, system-ui, sans-serif";
  ctx.textBaseline = "top";
  ctx.fillText(title, 28, 32, 584);
  const shown = metrics.slice(0, chart ? 2 : 4);
  shown.forEach((m, i) => {
    const y = 110 + i * (chart ? 46 : 70);
    ctx.fillStyle = "rgba(148,163,184,0.9)";
    ctx.font = `400 ${chart ? 24 : 28}px Inter Variable, Inter, system-ui, sans-serif`;
    ctx.fillText(m.label, 28, y, 360);
    ctx.fillStyle = "#f8fafc";
    ctx.font = `700 ${chart ? 28 : 34}px Inter Variable, Inter, system-ui, sans-serif`;
    ctx.textAlign = "right";
    ctx.fillText(m.value, 612, y - 4, 260);
    ctx.textAlign = "left";
  });
  if (chart && chart.values.length) {
    // Mini-graphique : barres ou courbe, mois en abscisse, maximum indiqué
    const top = chart ? 110 + shown.length * 46 + 8 : 220;
    const x0 = 28;
    const x1 = 612;
    const y0 = top + 26;
    const y1 = 360;
    const max = Math.max(1, ...chart.values);
    ctx.fillStyle = "rgba(148,163,184,0.85)";
    ctx.font = "600 20px Inter Variable, Inter, system-ui, sans-serif";
    ctx.fillText(`${chart.title} · max ${compact(max, chart.format)}`, x0, top, 584);
    const step = (x1 - x0) / chart.values.length;
    const pts = chart.values.map((v, i) => [x0 + step * i + step / 2, y1 - ((y1 - y0) * v) / max] as const);
    if (chart.kind === "bars") {
      ctx.fillStyle = accent;
      pts.forEach(([x, y]) => ctx.fillRect(x - step * 0.3, y, step * 0.6, y1 - y));
    } else {
      ctx.strokeStyle = accent;
      ctx.lineWidth = 5;
      ctx.beginPath();
      pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
      ctx.stroke();
      ctx.fillStyle = accent;
      pts.forEach(([x, y]) => {
        ctx.beginPath();
        ctx.arc(x, y, 6, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.fillStyle = "rgba(148,163,184,0.9)";
    ctx.font = "400 18px Inter Variable, Inter, system-ui, sans-serif";
    ctx.textAlign = "center";
    chart.labels.forEach((l, i) => ctx.fillText(l, x0 + step * i + step / 2, y1 + 8));
    ctx.textAlign = "left";
  } else if (metrics.length === 0) {
    ctx.fillStyle = "rgba(148,163,184,0.8)";
    ctx.font = "400 28px Inter Variable, Inter, system-ui, sans-serif";
    ctx.fillText("Cliquer pour ouvrir le module", 28, 120);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}
