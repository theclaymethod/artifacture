import React from 'react';

const timeline = `
window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
tl.addLabel("s1", 0);
tl.set(".scene1", { opacity: 1 }, 0);
tl.to(".scene1", { opacity: 0, duration: 0.3, overwrite: "auto" }, 7.7);
tl.addLabel("s2", 8);
tl.to(".scene2", { opacity: 1, duration: 0.3, overwrite: "auto" }, 8);
tl.to(".scene2", { opacity: 0, duration: 0.3, overwrite: "auto" }, 15.7);
tl.addLabel("s3", 16);
tl.to(".scene3", { opacity: 1, duration: 0.3, overwrite: "auto" }, 16);
tl.set(".scene3", { opacity: 1 }, 24);
window.__timelines["ve-mdx-longform"] = tl;
`;

export default function VideoLongform() {
  return (
    <html lang="en">
      <head>
        <meta charSet="UTF-8" />
        <title>Bound retries and retain failed jobs</title>
        <style>{`
          * { box-sizing: border-box; margin: 0; padding: 0; }
          html, body { width: 100%; height: 100%; overflow: hidden; background: #f0efeb; color: #1c1c1a; font-family: Inter, system-ui, sans-serif; }
          #stage { width: 1920px; height: 1080px; position: relative; overflow: hidden; }
          .scene { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: center; padding: 120px 160px; opacity: 0; }
          .scene1 { opacity: 1; }
          .headline { max-width: 1350px; font-size: 100px; line-height: 1.08; font-weight: 600; letter-spacing: -0.035em; }
          .body { margin-top: 48px; max-width: 1250px; color: #65645f; font-size: 42px; line-height: 1.45; }
          .paths { display: grid; grid-template-columns: 1fr 1fr; gap: 100px; margin-top: 76px; }
          .path { padding-top: 32px; border-top: 2px solid #c8c7c1; }
          .path h3 { font-size: 38px; font-weight: 600; }
          .path p { margin-top: 24px; color: #65645f; font-size: 34px; line-height: 1.5; }
        `}</style>
      </head>
      <body>
        <div data-composition-id="ve-mdx-longform" data-duration="24" data-height="1080" data-start="0" data-width="1920" id="stage">
          <section className="scene scene1">
            <h1 className="headline">Preserve the operation identity across retries.</h1>
            <p className="body">Keep the same job identity. A timeout may have hidden a successful side effect.</p>
          </section>
          <section className="scene scene2">
            <h2 className="headline">Classify the failure before retrying.</h2>
            <div className="paths">
              <div className="path"><h3>Temporary failure</h3><p>Wait before retrying. Stay within a fixed attempt budget.</p></div>
              <div className="path"><h3>Permanent failure</h3><p>Retain the job and its error. Another identical attempt cannot repair invalid input.</p></div>
            </div>
          </section>
          <section className="scene scene3">
            <h2 className="headline">Quarantine jobs that need repair.</h2>
            <p className="body">Retain the payload reference, attempt history, and failure reason for manual repair and replay.</p>
          </section>
        </div>
        <script src="https://cdn.jsdelivr.net/npm/gsap@3.12.5/dist/gsap.min.js" />
        <script dangerouslySetInnerHTML={{ __html: timeline }} />
      </body>
    </html>
  );
}
