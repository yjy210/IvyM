import { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import './ImageTrail.css';

function lerp(a: number, b: number, n: number) { return (1 - n) * a + n * b; }

function getLocalPointerPos(e: MouseEvent | TouchEvent, rect: DOMRect) {
  let clientX = 0, clientY = 0;
  if (e.touches && e.touches.length > 0) {
    clientX = e.touches[0].clientX; clientY = e.touches[0].clientY;
  } else {
    clientX = (e as MouseEvent).clientX; clientY = (e as MouseEvent).clientY;
  }
  return { x: clientX - rect.left, y: clientY - rect.top };
}

function getMouseDistance(p1: { x: number; y: number }, p2: { x: number; y: number }) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

class ImageItem {
  DOM: { el: HTMLElement | null; inner: HTMLElement | null } = { el: null, inner: null };
  defaultStyle = { scale: 1, x: 0, y: 0, opacity: 0 };
  rect: DOMRect | null = null;
  resize: (() => void) | null = null;

  constructor(DOM_el: HTMLElement) {
    this.DOM.el = DOM_el;
    this.DOM.inner = this.DOM.el.querySelector('.content__img-inner');
    this.getRect();
    this.initEvents();
  }
  initEvents() {
    this.resize = () => { gsap.set(this.DOM.el, this.defaultStyle); this.getRect(); };
    window.addEventListener('resize', this.resize);
  }
  getRect() { if (this.DOM.el) this.rect = this.DOM.el.getBoundingClientRect(); }
}

class ImageTrailVariant5 {
  container: HTMLElement;
  DOM: { el: HTMLElement };
  images: ImageItem[];
  imagesTotal: number;
  imgPosition: number;
  zIndexVal: number;
  activeImagesCount: number;
  isIdle: boolean;
  threshold: number;
  mousePos: { x: number; y: number };
  lastMousePos: { x: number; y: number };
  cacheMousePos: { x: number; y: number };
  lastAngle: number;

  constructor(container: HTMLElement) {
    this.container = container;
    this.DOM = { el: container };
    this.images = [...container.querySelectorAll('.content__img')].map(img => new ImageItem(img as HTMLElement));
    this.imagesTotal = this.images.length;
    this.imgPosition = 0;
    this.zIndexVal = 1;
    this.activeImagesCount = 0;
    this.isIdle = true;
    this.threshold = 80;
    this.mousePos = { x: 0, y: 0 };
    this.lastMousePos = { x: 0, y: 0 };
    this.cacheMousePos = { x: 0, y: 0 };
    this.lastAngle = 0;

    const handlePointerMove = (ev: Event) => {
      const rect = container.getBoundingClientRect();
      this.mousePos = getLocalPointerPos(ev as MouseEvent, rect);
    };
    container.addEventListener('mousemove', handlePointerMove);
    container.addEventListener('touchmove', handlePointerMove);

    const initRender = (ev: Event) => {
      const rect = container.getBoundingClientRect();
      this.mousePos = getLocalPointerPos(ev as MouseEvent, rect);
      this.cacheMousePos = { ...this.mousePos };
      requestAnimationFrame(() => this.render());
      container.removeEventListener('mousemove', initRender);
      container.removeEventListener('touchmove', initRender);
    };
    container.addEventListener('mousemove', initRender);
    container.addEventListener('touchmove', initRender);
  }

  render() {
    const distance = getMouseDistance(this.mousePos, this.lastMousePos);
    if (distance > this.threshold) {
      this.showNextImage();
      this.lastMousePos = { ...this.mousePos };
    }
    this.cacheMousePos.x = lerp(this.cacheMousePos.x, this.mousePos.x, 0.1);
    this.cacheMousePos.y = lerp(this.cacheMousePos.y, this.mousePos.y, 0.1);
    if (this.isIdle && this.zIndexVal !== 1) this.zIndexVal = 1;
    requestAnimationFrame(() => this.render());
  }

  showNextImage() {
    const dx = this.mousePos.x - this.cacheMousePos.x;
    const dy = this.mousePos.y - this.cacheMousePos.y;
    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    if (angle < 0) angle += 360;
    if (angle > 90 && angle <= 270) angle += 180;
    const isMovingClockwise = angle >= this.lastAngle;
    this.lastAngle = angle;
    let startAngle = isMovingClockwise ? angle - 10 : angle + 10;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let ndx = dx, ndy = dy;
    if (dist !== 0) { ndx /= dist; ndy /= dist; }
    ndx *= dist / 150;
    ndy *= dist / 150;

    ++this.zIndexVal;
    this.imgPosition = this.imgPosition < this.imagesTotal - 1 ? this.imgPosition + 1 : 0;
    const img = this.images[this.imgPosition];
    gsap.killTweensOf(img.DOM.el!);

    gsap.timeline({ onStart: () => this.onImageActivated(), onComplete: () => this.onImageDeactivated() })
      .fromTo(img.DOM.el!,
        { opacity: 1, filter: 'brightness(80%)', scale: 0.1, zIndex: this.zIndexVal,
          x: this.cacheMousePos.x - img.rect!.width / 2, y: this.cacheMousePos.y - img.rect!.height / 2,
          rotation: startAngle },
        { duration: 1, ease: 'power2', scale: 1, filter: 'brightness(100%)',
          x: this.mousePos.x - img.rect!.width / 2 + ndx * 70,
          y: this.mousePos.y - img.rect!.height / 2 + ndy * 70,
          rotation: this.lastAngle }, 0)
      .to(img.DOM.el!, { duration: 0.4, ease: 'expo', opacity: 0 }, 0.5)
      .to(img.DOM.el!, { duration: 1.5, ease: 'power4', x: `+=${ndx * 120}`, y: `+=${ndy * 120}` }, 0.05);
  }

  onImageActivated() { this.activeImagesCount++; this.isIdle = false; }
  onImageDeactivated() { this.activeImagesCount--; if (this.activeImagesCount === 0) this.isIdle = true; }
}

const variantMap: Record<number, typeof ImageTrailVariant5> = { 5: ImageTrailVariant5 };

interface ImageTrailProps { items?: string[]; variant?: number; }

export default function ImageTrail({ items = [], variant = 5 }: ImageTrailProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;
    Promise.all(
      Array.from(containerRef.current.querySelectorAll('.content__img-inner')).map(el => {
        const bg = getComputedStyle(el).backgroundImage;
        const url = bg.slice(5, -2);
        return new Promise<void>(resolve => {
          const img = new Image();
          img.src = url;
          img.onload = () => resolve();
          img.onerror = () => resolve();
        });
      })
    ).then(() => {
      const Cls = variantMap[variant] || variantMap[5];
      new Cls(containerRef.current!);
    });
  }, [variant, items]);

  return (
    <div className="content" ref={containerRef}>
      {items.map((url, i) => (
        <div className="content__img" key={i}>
          <div className="content__img-inner" style={{ backgroundImage: `url(${url})` }} />
        </div>
      ))}
    </div>
  );
}
