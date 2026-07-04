import React from 'react';

const timeline = `
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
tl.addLabel("s1", 0);
tl.to(".scene1", { opacity: 1, duration: 0.4, ease: "power2.out", overwrite: "auto" }, "s1+=0.1");
tl.from(".scene1 .headline", { y: 36, opacity: 0, duration: 0.6, ease: "power2.out" }, "s1+=0.3");
tl.to(".scene1", { opacity: 0, duration: 0.4, overwrite: "auto" }, "s1+=3.8");
tl.addLabel("s2", 4);
tl.to(".scene2", { opacity: 1, duration: 0.4, ease: "power2.out", overwrite: "auto" }, "s2+=0.1");
tl.from(".scene2 .card", { y: 32, opacity: 0, duration: 0.5, stagger: 0.12, ease: "power2.out" }, "s2+=0.4");
tl.to(".scene2", { opacity: 0, duration: 0.4, overwrite: "auto" }, "s2+=3.6");
tl.addLabel("s3", 8);
tl.to(".scene3", { opacity: 1, duration: 0.4, ease: "power2.out", overwrite: "auto" }, "s3+=0.1");
tl.from(".scene3 .headline", { y: 36, opacity: 0, duration: 0.6, ease: "power2.out" }, "s3+=0.4");
window.__timelines["ve-mdx-longform"] = tl;
`;

export default function VideoLongform() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>VE MDX Longform Video</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 100%; height: 100%; overflow: hidden; background: #09090b; color: #f4f4f5; font-family: system-ui, sans-serif; }
          #stage { width: 1920px; height: 1080px; position: relative; overflow: hidden; background: #09090b; }
          .scene { position: absolute; inset: 0; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 96px 128px; opacity: 0; }
          .kicker { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 24px; letter-spacing: .22em; text-transform: uppercase; color: #5eead4; margin-bottom: 32px; }
          .headline { max-width: 1400px; text-align: center; font-size: 118px; line-height: 1.02; font-weight: 650; letter-spacing: -0.02em; }
          .body { margin-top: 34px; max-width: 1080px; text-align: center; color: #a1a1aa; font-size: 38px; line-height: 1.35; }
          .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 24px; width: 1440px; }
          .card { border: 2px solid rgba(255,255,255,.16); background: rgba(255,255,255,.045); padding: 38px; min-height: 260px; }
          .card b { display: block; color: #5eead4; font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: 28px; margin-bottom: 28px; }
          .card span { display: block; font-size: 42px; line-height: 1.1; }
        `}</style>
      </head>
      <body>
        <div
          data-composition-id="ve-mdx-longform"
          data-duration="12"
          data-height="1080"
          data-start="0"
          data-width="1920"
          id="stage"
        >
          <section className="scene scene1">
            <div className="kicker">generated from TSX</div>
            <h1 className="headline">MDX and React can feed video.</h1>
            <p className="body">This static composition is generated, not hand-written final HTML.</p>
          </section>
          <section className="scene scene2">
            <div className="grid">
              <div className="card">
                <b>01</b>
                <span>Author components.</span>
              </div>
              <div className="card">
                <b>02</b>
                <span>Export static markup.</span>
              </div>
              <div className="card">
                <b>03</b>
                <span>Render through Hyperframes.</span>
              </div>
            </div>
          </section>
          <section className="scene scene3">
            <div className="kicker">next gate</div>
            <h2 className="headline">Draft MP4 plus keyframes.</h2>
          </section>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js" />
        <script dangerouslySetInnerHTML={{ __html: timeline }} />
      </body>
    </html>
  );
}
