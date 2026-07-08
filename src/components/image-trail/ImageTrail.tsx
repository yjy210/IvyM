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

class ImageTrailVariant1 {
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

  constructor(container: HTMLElement) {
    this.container = container;
    this.DOM = { el: container };
    this.images = [...container.querySelectorAll('.content__img')].map(img => new ImageItem(img as HTMLElement));
    this.imagesTotal = this.images.length;
    this.imgPosition = 0;
    this.zIndexVal = 1;
    this.activeImagesCount = 0;
    this.isIdle = true;
    this.threshold = 10;  // 降低阈值
    this.mousePos = { x: 0, y: 0 };
    this.lastMousePos = { x: 0, y: 0 };
    this.cacheMousePos = { x: 0, y: 0 };

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
    this.cacheMousePos.x = lerp(this.cacheMousePos.x, this.mousePos.x, 0.1);
    this.cacheMousePos.y = lerp(this.cacheMousePos.y, this.mousePos.y, 0.1);
    if (distance > this.threshold) { this.showNextImage(); this.lastMousePos = { ...this.mousePos }; }
    if (this.isIdle && this.zIndexVal !== 1) this.zIndexVal = 1;
    requestAnimationFrame(() => this.render());
  }

  showNextImage() {
    console.log('show');  // 调试用
    ++this.zIndexVal;
    this.imgPosition = this.imgPosition < this.imagesTotal - 1 ? this.imgPosition + 1 : 0;
    const img = this.images[this.imgPosition];
    gsap.killTweensOf(img.DOM.el!);
    gsap.timeline({ onStart: () => this.onImageActivated(), onComplete: () => this.onImageDeactivated() })
      .fromTo(img.DOM.el!, { opacity: 1, scale: 1, zIndex: this.zIndexVal, x: this.cacheMousePos.x - img.rect!.width / 2, y: this.cacheMousePos.y - img.rect!.height / 2 },
        { duration: 0.4, ease: 'power1', x: this.mousePos.x - img.rect!.width / 2, y: this.mousePos.y - img.rect!.height / 2 }, 0)
      .to(img.DOM.el!, { duration: 0.4, ease: 'power3', opacity: 0, scale: 0.2 }, 0.4);
  }

  onImageActivated() { this.activeImagesCount++; this.idle = false; }
  onImageDeactivated() { this.activeImagesCount--; if (this.activeImagesCount === 0) this.isIdle = true; }
}

const variantMap: Record<number, typeof ImageTrailVariant1> = { 1: ImageTrailVariant1 };

interface ImageTrailProps { items?: string[]; variant?: number; }

export default function ImageTrail({ items = [], variant = 1 }: ImageTrailProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    // 等图片都加载完成再初始化 GSAP Promise.all(
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
      const Cls = variantMap[variant] || variantMap[1];
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