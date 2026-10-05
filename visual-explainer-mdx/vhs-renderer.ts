export type VhsSettings = Readonly<{ seconds: number; strength: number; grain: number; scanlines: number; aberration: number }>;

// Independent analytic texture filter. Noise is indexed by frame, never accumulated.
const vertex = `attribute vec2 position; varying vec2 uv;
void main(){uv=position*.5+.5;gl_Position=vec4(position,0.,1.);}`;
const fragment = `precision highp float;
varying vec2 uv; uniform sampler2D image;
uniform vec2 resolution; uniform float seconds, strength, grain, scanlines, aberration;
float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
void main(){
  float frame=floor(seconds*30.);
  float row=floor(uv.y*resolution.y/3.);
  float roll=fract(uv.y+seconds*.14);
  float crease=exp(-pow((roll-.5)*95.,2.));
  float drift=(sin(uv.y*53.+seconds*5.)*.8+(hash(vec2(row,frame))-.5)*.7+crease*9.)*strength/resolution.x;
  vec2 p=clamp(uv+vec2(drift,0.),vec2(0.),vec2(1.));
  float shift=aberration*strength/resolution.x;
  vec4 center=texture2D(image,p);
  vec3 rgb=vec3(texture2D(image,clamp(p+vec2(shift,0.),0.,1.)).r,center.g,texture2D(image,clamp(p-vec2(shift,0.),0.,1.)).b);
  float noise=(hash(floor(uv*resolution)+vec2(frame*13.,frame*7.))-.5)*grain*strength;
  float line=.5+.5*cos(uv.y*resolution.y*3.14159265);
  rgb=rgb*(1.-line*scanlines*strength)+noise;
  rgb+=crease*.04*strength;
  gl_FragColor=vec4(clamp(rgb,0.,1.),center.a);
}`;

export function createVhsRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext('webgl', { alpha: true, antialias: false, preserveDrawingBuffer: true, premultipliedAlpha: false });
  if (!gl) throw new Error('VHS requires WebGL.');
  const compile = (kind: number, code: string) => {
    const shader = gl.createShader(kind);
    if (!shader) throw new Error('Could not create VHS shader.');
    gl.shaderSource(shader, code); gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) { const message = gl.getShaderInfoLog(shader); gl.deleteShader(shader); throw new Error(`VHS shader failed: ${message}`); }
    return shader;
  };
  const vs = compile(gl.VERTEX_SHADER, vertex), fs = compile(gl.FRAGMENT_SHADER, fragment);
  const program = gl.createProgram(), vertices = gl.createBuffer(), texture = gl.createTexture();
  if (!program || !vertices || !texture) { gl.deleteShader(vs); gl.deleteShader(fs); throw new Error('Could not allocate VHS filter.'); }
  gl.attachShader(program, vs); gl.attachShader(program, fs); gl.linkProgram(program);
  gl.deleteShader(vs); gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) { gl.deleteProgram(program); gl.deleteBuffer(vertices); gl.deleteTexture(texture); throw new Error('Could not link VHS filter.'); }
  gl.useProgram(program);
  gl.bindBuffer(gl.ARRAY_BUFFER, vertices); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const position = gl.getAttribLocation(program, 'position'); gl.enableVertexAttribArray(position); gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
  gl.bindTexture(gl.TEXTURE_2D, texture); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
  const names: Array<keyof VhsSettings> = ['seconds', 'strength', 'grain', 'scanlines', 'aberration'];
  const locations = new Map(names.map(name => [name, gl.getUniformLocation(program, name)]));
  return {
    draw(source: HTMLCanvasElement, settings: VhsSettings) {
      gl.viewport(0, 0, canvas.width, canvas.height); gl.useProgram(program);
      gl.bindTexture(gl.TEXTURE_2D, texture); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
      gl.uniform2f(gl.getUniformLocation(program, 'resolution'), canvas.width, canvas.height);
      for (const [name, location] of locations) gl.uniform1f(location, settings[name]);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    },
    dispose() { gl.deleteProgram(program); gl.deleteBuffer(vertices); gl.deleteTexture(texture); },
  };
}
