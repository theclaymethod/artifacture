import { useEffect, useRef, useState } from "react";
import {
  Exploded,
  Relay,
  Rebuild,
  Terrain,
  Turntable,
  Stack,
} from "@lucasmarkes/hairline/react";
import { Deck, usePresentationStateNavigation, type Slide } from "./deck";
import Story from "./opening.mdx";

import chapters from "./chapters.json";

const baseUrl = import.meta.env.BASE_URL;

function Film() {
  const video = useRef<HTMLVideoElement>(null);
  const [active, setActive] = useState(0);
  const [muted, setMuted] = useState(true);
  const [playing, setPlaying] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!media.matches) video.current?.play().catch(() => {});
    const pause = () => {
      if (media.matches) video.current?.pause();
    };
    media.addEventListener("change", pause);
    return () => media.removeEventListener("change", pause);
  }, []);
  return (
    <div className="film-player">
      <video
        ref={video}
        muted={muted}
        loop
        playsInline
        controls
        preload="metadata"
        poster={`${baseUrl}media/poster.jpg`}
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onVolumeChange={(event) => setMuted(event.currentTarget.muted)}
        onTimeUpdate={() =>
          setActive(
            chapters.reduce(
              (active, c, i) =>
                c.time <= (video.current?.currentTime ?? 0) ? i : active,
              0,
            ),
          )
        }
        aria-label="Make the invisible obvious — a 52 second narrated motion study"
      >
        <source src={`${baseUrl}media/overdrive.mp4`} type="video/mp4" />
        <track
          kind="captions"
          src={`${baseUrl}media/overdrive.vtt`}
          srcLang="en"
          label="English"
        />
      </video>
      <div className="film-controls">
        <div className="chapters" aria-label="Film chapters">
          {chapters.map((c, i) => (
            <button
              key={c.name}
              aria-pressed={i === active}
              onClick={() => {
                if (video.current) {
                  video.current.currentTime = c.time;
                  video.current.scrollIntoView({
                    block: "start",
                    behavior: "smooth",
                  });
                  video.current.play().catch(() => {});
                }
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
        <div className="playback">
          <button
            onClick={() => {
              if (video.current)
                playing
                  ? video.current.pause()
                  : void video.current.play().catch(() => {});
            }}
          >
            {playing ? "Pause" : "Play"}
          </button>
          <button aria-pressed={!muted} onClick={() => setMuted(!muted)}>
            {muted ? "Sound on" : "Sound off"}
          </button>
        </div>
      </div>
    </div>
  );
}
const mechanisms = [
  {
    name: "Unfold",
    Component: Exploded,
    copy: "Move across the object to separate its layers. Move down to inspect a layer.",
  },
  {
    name: "Trace",
    Component: Relay,
    copy: "Follow a branch. The route lights up one connection at a time.",
  },
  {
    name: "Propagate",
    Component: Rebuild,
    copy: "Touch a dependency. Watch the change travel through everything that depends on it.",
  },
  {
    name: "Sculpt",
    Component: Terrain,
    copy: "Move across the field. Nearby columns rise into a continuous landscape.",
  },
  {
    name: "Rotate",
    Component: Turntable,
    copy: "Flick the turntable. Momentum carries the composition into its next view.",
  },
  {
    name: "Inspect",
    Component: Stack,
    copy: "Move vertically to open a stack frame and see what sits above it.",
  },
];
function Mechanism() {
  const [index, setIndex] = useState(0);
  const [intensity, setIntensity] = useState(0.7);
  const [play, setPlay] = useState(true);
  const { Component, copy } = mechanisms[index];
  return (
    <div className="mechanism">
      <div className="mechanism-tabs" aria-label="Choose a mechanism">
        {mechanisms.map((m, i) => (
          <button
            key={m.name}
            aria-pressed={i === index}
            onClick={() => setIndex(i)}
          >
            {m.name}
          </button>
        ))}
      </div>
      <div className="mechanism-layout">
        <div className="native-figure">
          <Component
            key={index}
            play={play}
            intensity={intensity}
            theme="light"
          />
        </div>
        <div className="mechanism-copy">
          <h3>{mechanisms[index].name} the system.</h3>
          <p>{copy}</p>
          <label className="range">
            Response{" "}
            <input
              aria-label="Motion response"
              type="range"
              min="0"
              max="1"
              step=".01"
              value={intensity}
              onChange={(e) => setIntensity(Number(e.target.value))}
            />
          </label>
          <button
            className="text-button"
            aria-pressed={play}
            onClick={() => setPlay(!play)}
          >
            {play ? "Stop the demonstration" : "Play the demonstration"}
          </button>
          <p className="provenance">
            Native figures by{" "}
            <a
              href="https://hairline.lucasmarkes.com/"
              target="_blank"
              rel="noreferrer"
            >
              Hairline
            </a>
            .
          </p>
        </div>
      </div>
    </div>
  );
}
function Anatomy() {
  return (
    <div className="anatomy-demo">
      <div className="anatomy-copy">
        <h3>
          A small movement.
          <br />A visible consequence.
        </h3>
        <p>
          Slide the carriage beneath the probe. The changing block height moves
          the plunger and turns the needle.
        </p>
        <p className="provenance">
          The working dial indicator from{" "}
          <a
            href="https://skills.wheresryan.sh/anatomy/collection"
            target="_blank"
            rel="noreferrer"
          >
            Anatomy
          </a>
          , with its original geometry and physical model.
        </p>
      </div>
      <iframe
        src={`${baseUrl}vendor/anatomy-dial.html`}
        title="Interactive Anatomy dial indicator"
        sandbox="allow-scripts"
        loading="lazy"
      />
    </div>
  );
}

function Space() {
  const [amount, setAmount] = useState(0.65);
  const [rotate, setRotate] = useState(false);
  const [vector, setVector] = useState<[number, number]>([1.8, 1.5]);
  const [step, setStep] = useState(0);
  const state = usePresentationStateNavigation({
    index: step,
    count: 3,
    onChange: (n) => {
      setStep(n);
      setAmount(n === 0 ? 0 : 0.8);
      setRotate(n === 2);
    },
  });
  const angle = rotate ? amount * 0.9 : 0;
  const a = Math.cos(angle),
    b = Math.sin(angle),
    c = rotate ? -b : amount,
    d = rotate ? a : 1;
  const map = (x: number, y: number) => [
    360 + (a * x + c * y) * 70,
    270 - (b * x + d * y) * 70,
  ];
  const point = (x: number, y: number) => map(x, y).join(",");
  const end = map(...vector);
  const startDrag = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.type === "pointermove" && !event.buttons) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const svg = event.currentTarget;
    const p = new DOMPoint(event.clientX, event.clientY).matrixTransform(
      svg.getScreenCTM()!.inverse(),
    );
    const x = (p.x - 360) / 70,
      y = (270 - p.y) / 70,
      det = a * d - b * c;
    setVector([
      Math.max(-2.5, Math.min(2.5, (d * x - c * y) / det)),
      Math.max(-2.5, Math.min(2.5, (-b * x + a * y) / det)),
    ]);
  };
  return (
    <div className="space-layout" {...state}>
      <div className="space-copy">
        <h3>
          Change the space.
          <br />
          Keep the idea.
        </h3>
        <p>
          A shear leans the grid. A rotation turns it. Every point follows the
          same rule.
        </p>
        <div className="segmented">
          <button aria-pressed={!rotate} onClick={() => setRotate(false)}>
            Shear
          </button>
          <button aria-pressed={rotate} onClick={() => setRotate(true)}>
            Rotate
          </button>
        </div>
        <label className="range">
          Transformation{" "}
          <input
            aria-label="Transformation amount"
            type="range"
            min="0"
            max="1"
            step=".01"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
        </label>
        <label className="range">
          Vector x{" "}
          <input
            aria-label="Vector x"
            type="range"
            min="-2.5"
            max="2.5"
            step=".1"
            value={vector[0]}
            onChange={(e) => setVector([Number(e.target.value), vector[1]])}
          />
        </label>
        <label className="range">
          Vector y{" "}
          <input
            aria-label="Vector y"
            type="range"
            min="-2.5"
            max="2.5"
            step=".1"
            value={vector[1]}
            onChange={(e) => setVector([vector[0], Number(e.target.value)])}
          />
        </label>
        <p className="matrix" aria-label="Transformation matrix">
          [{a.toFixed(2)} &nbsp; {c.toFixed(2)}]<br />[{b.toFixed(2)} &nbsp;{" "}
          {d.toFixed(2)}]
        </p>
      </div>
      <svg
        viewBox="0 0 720 540"
        className="space-visual"
        role="img"
        aria-label="A transformed grid, unit square, circle and draggable vector"
        onPointerDown={startDrag}
        onPointerMove={startDrag}
      >
        <defs>
          <clipPath id="grid-clip">
            <rect width="720" height="540" />
          </clipPath>
        </defs>
        <g clipPath="url(#grid-clip)">
          {Array.from({ length: 15 }, (_, i) => i - 7).map((i) => (
            <g
              key={i}
              stroke={i === 0 ? "#6b7484" : "#252c38"}
              strokeWidth={i === 0 ? 1.5 : 1}
            >
              <line
                x1={map(i, -8)[0]}
                y1={map(i, -8)[1]}
                x2={map(i, 8)[0]}
                y2={map(i, 8)[1]}
              />
              <line
                x1={map(-8, i)[0]}
                y1={map(-8, i)[1]}
                x2={map(8, i)[0]}
                y2={map(8, i)[1]}
              />
            </g>
          ))}
          <polygon
            points={[point(0, 0), point(2, 0), point(2, 2), point(0, 2)].join(
              " ",
            )}
            stroke="#ed814f"
            fill="#ed814f"
            fillOpacity=".12"
            strokeWidth="2"
          />
          <polyline
            points={Array.from({ length: 121 }, (_, i) =>
              point(
                2 * Math.cos((i / 120) * Math.PI * 2),
                2 * Math.sin((i / 120) * Math.PI * 2),
              ),
            ).join(" ")}
            stroke="#b6c0d1"
            fill="none"
            strokeWidth="1.3"
          />
          <line
            x1="360"
            y1="270"
            x2={end[0]}
            y2={end[1]}
            stroke="#ed814f"
            strokeWidth="3"
          />
          <circle cx={end[0]} cy={end[1]} r="8" fill="#ed814f" />
          <circle cx="360" cy="270" r="3" fill="white" />
        </g>
      </svg>
    </div>
  );
}
function Review() {
  const [step, setStep] = useState(0);
  const states = usePresentationStateNavigation({
    index: step,
    count: 3,
    onChange: setStep,
  });
  return (
    <div className="review-demo" {...states}>
      <div className="review-copy">
        <h3>
          Make a code review
          <br />
          something you can see.
        </h3>
        <p>
          {
            [
              "Three exports. Three separate renderer instances.",
              "Move creation outside the loop. Keep the renderer alive.",
              "One renderer feeds every output. The lifetime now matches the work.",
            ][step]
          }
        </p>
        <div className="segmented">
          {["Before", "Change", "After"].map((v, i) => (
            <button
              key={v}
              aria-pressed={step === i}
              onClick={() => setStep(i)}
            >
              {v}
            </button>
          ))}
        </div>
        <p className="provenance">
          An illustrative lifetime refactor, not a claim about a measured
          performance gain.
        </p>
      </div>
      <div className="review-stage" data-after={step > 0}>
        <pre aria-label="Illustrative code diff">
          <code>
            {step > 0 && (
              <span className="added">
                {"const renderer = create(scene);\n"}
              </span>
            )}
            {"for (const output of outputs) {\n"}
            <span className={step === 1 ? "removed" : ""}>
              {step < 2 ? "  const renderer = create(scene);\n" : ""}
            </span>
            {"  renderer.render(output);\n}"}
          </code>
        </pre>
        <div className="render-flow">
          <div className="instances">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="instance"
                aria-hidden={step > 0 && i > 0}
                style={{ "--i": i } as React.CSSProperties}
              >
                Renderer
              </div>
            ))}
          </div>
          <div className="flow-lines" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
          <div className="outputs">
            <span>Diagram</span>
            <span>Slides</span>
            <span>Film</span>
          </div>
        </div>
      </div>
    </div>
  );
}
const slides: Slide[] = [
  { id: "idea", title: "The idea", component: Story },
  { id: "mechanism", title: "Mechanism", component: Mechanism },
  { id: "anatomy", title: "Anatomy", component: Anatomy },
  { id: "transformation", title: "Transformation", component: Space },
  { id: "review", title: "Code review", component: Review },
  { id: "film", title: "The film", component: Film },
];
export default function App() {
  if (new URLSearchParams(location.search).has("slides"))
    return (
      <>
        <a className="back" href="./">
          ← Back to the playground
        </a>
        <Deck slides={slides} />
      </>
    );
  return (
    <>
      <header>
        <a className="wordmark" href="#">
          Artifacture<span>↗</span>
        </a>
        <nav>
          <a href="#film">Watch</a>
          <a href="#play">Play</a>
          <a href="?slides#idea">Present ↗</a>
        </nav>
      </header>
      <main>
        <section className="intro">
          <h1>
            Make the invisible
            <br />
            <em>obvious.</em>
          </h1>
          <div>
            <p>
              A system you can unfold.
              <br />
              An idea you can transform.
              <br />A story you can put in motion.
            </p>
            <a className="text-button" href="#film">
              Watch the motion study ↓
            </a>
          </div>
        </section>
        <section id="film" className="film-section">
          <Film />
          <div className="film-note">
            <p>
              ISO + Anatomy, rendered with native FFrames. Fresh Ainthony
              narration.
            </p>
            <a href={`${baseUrl}media/overdrive.mp4`} download>
              Download the film ↗
            </a>
          </div>
        </section>
        <section id="play" className="play-section">
          <div className="section-heading">
            <h2>Pull it apart.</h2>
            <p>
              Six working mechanisms. Move your pointer inside the illustration,
              or focus it and use the arrow keys.
            </p>
          </div>
          <Mechanism />
        </section>
        <section className="anatomy-section">
          <Anatomy />
        </section>
        <section className="dark-section">
          <Space />
        </section>
        <section className="review-section">
          <Review />
        </section>
        <section className="outro">
          <h2>
            Same story.
            <br />
            Different stage.
          </h2>
          <div>
            <p>
              These are also interactive slides. The diagrams, controls and
              transformations travel with the explanation.
            </p>
            <a className="primary-link" href="?slides#idea">
              Open the presentation ↗
            </a>
          </div>
        </section>
      </main>
      <footer>
        <span>
          Editable MDX + React. Hairline + Anatomy. Native FFrames. Ainthony
          voice.
        </span>
        <a href={`${baseUrl}media/overdrive-source.zip`} download>
          Get the source ↗
        </a>
      </footer>
    </>
  );
}
