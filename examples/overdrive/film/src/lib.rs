//! An original motion study. Geometry belongs to this film; timing and rendering belong to FFrames.
use fframes::{AnimateRuntimeInput, AudioMap, AudioTrack, AudioTimestamp::*, Color, Duration, FFramesContext, FFramesSyncedVideoFrame, Frame, Scene, Scenes, Svgr, SyncVideoFrameInput, Video, animation::{AnimationRuntime, Easing}, include_media_dir};
use std::sync::LazyLock;
include_media_dir!(pub struct FilmMedia, "media");
pub const WIDTH: usize = 1920;
pub const HEIGHT: usize = 1080;
const INK: &str = "#202328";
const LINE: &str = "#a2a8b2";
const ACCENT: &str = "#e56a35";
const FONT: &str = "DM Sans";
static EASE: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(1.2, &Easing::CubicBezier(0.16, 1., 0.3, 1.)));
static SPRING: LazyLock<AnimationRuntime> = LazyLock::new(|| AnimationRuntime::new(3., &Easing::Spring {mass: 1., stiffness: 140., damping: 19.}));
fn reveal(frame: &Frame, start: f32) -> f32 { frame.animate_runtime(AnimateRuntimeInput {on_second: start, from: 0., to: 1., animation_runtime: &EASE}) }
fn spring(frame: &Frame, start: f32) -> f32 { frame.animate_runtime(AnimateRuntimeInput {on_second: start, from: 0., to: 1., animation_runtime: &SPRING}) }
#[derive(Debug)]
pub struct FilmVideo { shots: [Shot; 6] }
impl FilmVideo { pub fn new(_media: &FilmMedia, _title: &str) -> Self { Self {shots: [Shot(0),Shot(1),Shot(2),Shot(3),Shot(4),Shot(5)]} } }
impl Video for FilmVideo {
 const FPS: usize = 30; const WIDTH: usize = WIDTH; const HEIGHT: usize = HEIGHT; const BACKGROUND_COLOR: Color = Color::WHITE;
 fn duration(&self) -> Duration<'_> { Duration::Auto }
 fn audio(&self) -> AudioMap<'_> { AudioMap::from([AudioTrack::new("ainthony.wav", Second(0.4)..Eof).voice().gain_db(2.)]) }
 fn define_scenes(&self) -> Scenes<'_> { Scenes::from(self.shots.iter().map(|s| s as &dyn Scene).collect::<Vec<_>>()) }
 fn render_frame<'a>(&'a self, frame: Frame, ctx: &FFramesContext<'a,'_>) -> Svgr<'a> { fframes::svgr!(<svg xmlns="http://www.w3.org/2000/svg" width={WIDTH} height={HEIGHT} viewBox="0 0 1920 1080">{ctx.render_scenes(&frame)}</svg>) }
}
#[derive(Debug)] struct Shot(u8);
impl Scene for Shot {
 fn name(&self) -> &'static str { ["Unfold", "Follow", "Mechanism", "Transform", "Review", "Compose"][self.0 as usize] }
 fn duration(&self) -> Duration<'_> { Duration::Seconds([7.2,5.6,14.56,6.48,5.84,12.72][self.0 as usize]) }
 fn render_frame<'a>(&'a self, frame: Frame, ctx: &FFramesContext<'a,'_>) -> Svgr<'a> {
  match self.0 {0 => iso(&frame),1 => graph(&frame),2 => anatomy(&frame,ctx),3 => math(&frame),4 => review(&frame),_ => compose(&frame)}
 }
}
fn heading<'a>(f: &Frame, a: &'a str, b: &'a str, caption: &'a str, dark: bool) -> Svgr<'a> {
 let color = if dark {"#f9f9fb"} else {INK};
 fframes::svgr!(<g font-family={FONT} font-weight="500" fill={color}>
 <text x="156" y="222" font-size="104" letter-spacing="-4">{a}</text>
 <g opacity={reveal(f,0.16)} transform={format!("translate(0 {})", 28.*(1.-spring(f,0.16)))}><text x="156" y="335" font-size="104" letter-spacing="-4">{b}</text></g>
 <text x="162" y="932" font-size="36" opacity={reveal(f,0.55)}>{caption}</text>
 </g>)
}
fn point(x:f32,y:f32,z:f32,angle:f32,origin:(f32,f32)) -> (f32,f32) {
 let u=x*angle.cos()-y*angle.sin(); let v=x*angle.sin()+y*angle.cos();
 (origin.0+u,origin.1+v*0.48-z)
}
fn poly(points:&[(f32,f32)]) -> String { points.iter().map(|(x,y)| format!("{x:.2},{y:.2}")).collect::<Vec<_>>().join(" ") }
fn slab<'a>(x:f32,y:f32,z:f32,w:f32,d:f32,h:f32,a:f32,o:(f32,f32),active:bool) -> Svgr<'a> {
 let p=|dx,dy,dz| point(x+dx,y+dy,z+dz,a,o);
 let top=poly(&[p(0.,0.,h),p(w,0.,h),p(w,d,h),p(0.,d,h)]);
 let left=poly(&[p(0.,d,0.),p(w,d,0.),p(w,d,h),p(0.,d,h)]);
 let right=poly(&[p(w,0.,0.),p(w,d,0.),p(w,d,h),p(w,0.,h)]);
 let stroke=if active {ACCENT} else {LINE};
 fframes::svgr!(<g stroke={stroke} stroke-width="1.7" stroke-linejoin="round"><polygon points={left} fill={if active {"#fce1d5"} else {"#f7f8fa"}}/><polygon points={right} fill={if active {"#f5b99e"} else {"#eef0f3"}}/><polygon points={top} fill={if active {"#fff3ec"} else {"#ffffff"}}/></g>)
}
fn iso<'a>(f:&Frame)->Svgr<'a> {
 let t=f.seconds(); let angle=0.70+0.09*(t*0.6).sin(); let origin=(1270.,746.); let opening=spring(f,0.45); let mut geometry=Vec::new();
 let spread=145.*opening;
 for layer in 0..3 {
  let z=layer as f32*spread;
  geometry.push(slab(-230.,-230.,z,460.,460.,18.,angle,origin,false));
  for y in 0..5 {for x in 0..5 {
   let active=layer==1 && x==2 && y==2;
   let lift=if active {30.*reveal(f,2.)} else {0.};
   geometry.push(slab(-185.+x as f32*77.,-185.+y as f32*77.,z+18.+lift,48.,48.,if layer==0 {12.} else {27.},angle,origin,active));
  }}
 }
 let guides:Vec<Svgr>=[(-230.,-230.),(230.,-230.),(230.,230.),(-230.,230.)].into_iter().map(|(x,y)|{let (a,b)=point(x,y,0.,angle,origin);let(c,d)=point(x,y,spread*2.+60.,angle,origin);fframes::svgr!(<path d={format!("M{a} {b} L{c} {d}")} stroke="#c5c9cf" stroke-width="1.4" stroke-dasharray="5 10" opacity={opening}/>) }).collect();
 let orb=point(0.,0.,40.+(1.-((t-2.5)/2.).clamp(0.,1.))*spread*2.,angle,origin);
 fframes::svgr!(<g><rect width="1920" height="1080" fill="#ffffff"/>{heading(f,"Make the", "invisible obvious.","Unfold the system. Keep the explanation.",false)}{guides}{geometry}<circle cx={orb.0} cy={orb.1} r="12" fill={ACCENT} opacity={reveal(f,2.5)}/></g>)
}
fn graph<'a>(f:&Frame)->Svgr<'a> {
 let t=f.seconds(); let nodes: [(f32,f32,&str);5]=[(250.,650.,"Source"),(650.,505.,"Diagram"),(650.,790.,"Slide"),(1080.,650.,"Scene"),(1520.,650.,"Film")];
 let edges=[(0,1),(0,2),(1,3),(2,3),(3,4)];
 let lines:Vec<Svgr>=edges.into_iter().enumerate().map(|(i,(a,b))|{
  let(x,y,_)=nodes[a];let(u,v,_)=nodes[b];let length=((u-x)*(u-x)+(v-y)*(v-y)).sqrt();
  let progress=reveal(f,0.3+i as f32*0.18);let p=((t-1.5-i as f32*0.30)/1.2).clamp(0.,1.);let packet= if p>0. && p<1. {1.} else {0.};
  fframes::svgr!(<g><path d={format!("M{x} {y} L{u} {v}")} stroke="#c0c5cd" stroke-width="2" stroke-dasharray={length} stroke-dashoffset={length*(1.-progress)}/><circle cx={x+(u-x)*p} cy={y+(v-y)*p} r="10" fill={ACCENT} opacity={packet}/></g>)
 }).collect();
 let blocks:Vec<Svgr>=nodes.into_iter().enumerate().map(|(i,(x,y,label))|{
  let p=reveal(f,0.15+i as f32*0.12);let pulse=reveal(f,1.5+i as f32*0.42);
  fframes::svgr!(<g opacity={p} transform={format!("translate(0 {})",36.*(1.-spring(f,i as f32*0.12)))}>
  <rect x={x-80.} y={y-60.} width="160" height="120" rx="24" fill="#fff" stroke={if pulse>0.5 {ACCENT} else {LINE}} stroke-width="2"/>
  <path d={format!("M{} {} l30 -17 l30 17 l-30 17 Z M{} {} v36 l30 17 l30 -17 v-36 M{} {} v36",x-30.,y-12.,x-30.,y-12.,x,y+5.)} fill="none" stroke={INK} stroke-width="2"/>
  <text x={x} y={y+112.} text-anchor="middle" font-family={FONT} font-size="34" fill={INK}>{label}</text></g>)
 }).collect();
 fframes::svgr!(<g><rect width="1920" height="1080" fill="#ffffff"/>{heading(f,"Follow the idea.","Across every medium.","Shared content. Native tools. An editable path.",false)}{lines}{blocks}</g>)
}
fn math<'a>(f:&Frame)->Svgr<'a> {
 let p=reveal(f,1.4); let q=reveal(f,4.0); let shear=p*0.8*(1.-q);let angle=q*0.68;let scale=76.;let ox=1330.;let oy=650.;
 let map=|x:f32,y:f32| {let a=x+shear*y; (ox+scale*(a*angle.cos()-y*angle.sin()),oy-scale*(a*angle.sin()+y*angle.cos()))};
 let mut grid=Vec::new();
 for i in -5..=5 {let k=i as f32;let(a,b)=map(k,-3.);let(c,d)=map(k,3.);let(e,g)=map(-4.,k);let(h,j)=map(4.,k); grid.push(fframes::svgr!(<g stroke={if i==0 {"#5b6370"} else {"#252b34"}} stroke-width={if i==0 {2.} else {1.}}><path d={format!("M{a} {b} L{c} {d} M{e} {g} L{h} {j}")}/></g>));}
 let shape=poly(&[map(0.,0.),map(2.,0.),map(2.,2.),map(0.,2.)]);
 let ring:Vec<(f32,f32)>=(0..=120).map(|i|{let a=i as f32/120.*std::f32::consts::TAU;map(a.cos()*2.,a.sin()*2.)}).collect();
 let vector=map(2.,2.);
 fframes::svgr!(<g><defs><clipPath id="math-area"><rect x="890" y="390" width="900" height="465"/></clipPath></defs><rect width="1920" height="1080" fill="#090c12"/>{heading(f,"Change your", "frame of reference.","A transformation changes the space around an idea.",true)}<g opacity={reveal(f,0.1)} clip-path="url(#math-area)">{grid}<polygon points={shape} fill={ACCENT} fill-opacity="0.12" stroke={ACCENT} stroke-width="3"/><polyline points={poly(&ring)} fill="none" stroke="#a7b2c5" stroke-width="1.7"/><path d={format!("M{ox} {oy} L{} {}",vector.0,vector.1)} stroke={ACCENT} stroke-width="5"/><circle cx={vector.0} cy={vector.1} r="9" fill={ACCENT}/><circle cx={ox} cy={oy} r="5" fill="#fff"/></g><g font-family={FONT} fill="#eef1f6" font-size="44"><text x="162" y="565">{if q>0.5 {"Rotate."} else if p>0.5 {"Shear."} else {"Start with a square."}}</text><text x="162" y="635" fill="#a7b2c5" font-size="34">"Same points. New perspective."</text></g></g>)
}
fn review<'a>(f:&Frame)->Svgr<'a> {
 let after=reveal(f,2.0); let old=1.-after; let mut rows=Vec::new();
 for i in 0..3 {let y=545.+i as f32*88.;let opacity=if i==0 {1.} else {old};let shift=if i==0 {0.} else {80.*after};
 rows.push(fframes::svgr!(<g opacity={opacity} transform={format!("translate({shift} 0)")}><rect x="1250" y={y} width="360" height="64" rx="12" fill="#f6f7f9" stroke={LINE} stroke-width="1.4"/><circle cx="1280" cy={y+32.} r="7" fill={ACCENT}/><text x="1300" y={y+42.} font-family={FONT} font-size="28" fill={INK}>"render(scene)"</text></g>));}
 fframes::svgr!(<g><rect width="1920" height="1080" fill="#fff"/>{heading(f,"Make the change", "visible.","In this illustrative review: reuse one renderer per scene.",false)}
 <rect x="160" y="452" width="960" height="350" rx="22" fill="#f6f7f9"/>
 <g font-family={FONT} font-size="38" fill={INK}><text x="198" y="520">"for each output"</text><text x="244" y="592" opacity={old}>"createRenderer(scene)"</text><text x="244" y="592" fill={ACCENT} opacity={after}>"reuseRenderer(scene)"</text><text x="244" y="664">"render(output)"</text></g>
 <path d="M236 578 H727" stroke={ACCENT} stroke-width="3" stroke-dasharray="491" stroke-dashoffset={491.*(1.-after)} opacity={old}/>
 <path d="M1120 584 H1240" stroke={ACCENT} stroke-width="2" stroke-dasharray="6 8"/>{rows}
 <text x="1250" y="488" font-family={FONT} font-size="30" fill={INK}>{if after>0.5 {"One shared instance"} else {"Repeated work"}}</text></g>)
}
fn compose<'a>(f:&Frame)->Svgr<'a> {
 let cards:Vec<Svgr>=(0..3).map(|i|{let p=spring(f,0.10+i as f32*0.13);let x=370.+i as f32*585.;let y=460.+(1.-p)*95.;let a=(i as f32-1.)*8.*(1.-reveal(f,2.));
 fframes::svgr!(<g transform={format!("translate({x} {y}) rotate({a})")} opacity={reveal(f,i as f32*0.13)}><rect x="-210" y="0" width="420" height="258" rx="15" fill="#fff" stroke={LINE} stroke-width="1.7"/>
 <g transform="translate(0 122)">{slab(-60.,-60.,0.,120.,120.,35.,0.7,(0.,0.),true)}</g><text x="0" y="325" text-anchor="middle" font-family={FONT} font-size="36" fill={INK}>{["Diagram","Slides","Film"][i as usize]}</text></g>) }).collect();
 fframes::svgr!(<g><rect width="1920" height="1080" fill="#fff"/><text x="960" y="240" text-anchor="middle" font-family={FONT} font-size="116" letter-spacing="-5" fill={INK}>"Build once. Explain everywhere."</text>{cards}<g opacity={reveal(f,6.2)}><text x="960" y="930" text-anchor="middle" font-family={FONT} font-size="44" fill={INK}>{if f.seconds()>9.0 {"Let native tools do the heavy lifting."} else {"Keep the story compact."}}</text></g></g>)
}

fn anatomy<'a>(f: &Frame, ctx: &FFramesContext<'a,'_>) -> Svgr<'a> {
 let illustration = f.get_synced_video_frame(ctx,"anatomy.mp4", &SyncVideoFrameInput {start_from:0.,looping:true,editor_fallback_image:None}).map(|image| fframes::svgr!(<image href={image.into_image().href()} x="330" y="196" width="1260" height="798"/>)).unwrap_or_else(Svgr::empty);
 fframes::svgr!(<g><rect width="1920" height="1080" fill="#fff"/>{illustration}<text x="156" y="180" font-family={FONT} font-weight="500" font-size="96" letter-spacing="-3" fill={INK}>"The object is the explanation."</text><text x="162" y="980" font-family={FONT} font-size="36" fill={INK}>"A moving block. A rising probe. A measured change."</text></g>)
}
