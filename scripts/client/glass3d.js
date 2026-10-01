// SpiritLens の3Dグラス（Three.js）。
//
// 実写の映像版と並べて比べるための試作。ページに ?glass=3d を付けると、
// ヒーローとオープニングのグラスがこちらに置き換わる。/lab/glass/ では両方を並べて再生できる。
//
// 作り方の要点:
// - 形は参照映像の最終フレーム（dist/assets/glass-poster.jpg）から断面の輪郭を拾った回転体。
//   グラスは回転体なので、外形の断面を1本描けば立体になる
// - 背景は不透明の黒で描き、要素側の mix-blend-mode: screen で地に重ねる。
//   黒は消えて反射と液体の光だけが残るので、映像版のような四角い枠が出ない
// - 器は加算合成。中の液体を隠さず、縁のフレネル反射だけが光る
// - 液体は内側の回転体を水平な面（clippingPlane）で切り、液面の円盤で蓋をする。
//   注ぐと面が上がり、着地で減衰振動する
// - 映り込みは、暖色のランプと縦長の面光源を並べた「バー」を環境として焼いて作る。
//   白いスタジオ照明だと、ガラスにバーの色が乗らない

import * as THREE from 'three';

// ── 形 ──────────────────────────────────────────────────────────────
// (半径, 高さ)。参照フレーム 540×766 の画素から 0.005025/px で換算した値。
// 外側を下から縁まで上り、縁で折り返して内側を底まで下りる。
const SHELL = [
  [0, 0], [0.40, 0], [0.585, 0.004], [0.605, 0.022], [0.595, 0.055], [0.52, 0.085],
  [0.40, 0.12], [0.26, 0.16], [0.17, 0.21], [0.13, 0.27], [0.122, 0.33], [0.122, 0.44],
  [0.135, 0.50], [0.175, 0.545], [0.30, 0.595], [0.40, 0.65], [0.455, 0.70], [0.505, 0.80],
  [0.553, 0.945], [0.585, 1.10], [0.608, 1.246], [0.630, 1.45], [0.648, 1.648],
  [0.665, 1.849], [0.673, 2.10], [0.674, 2.138], [0.669, 2.150], [0.660, 2.150],
  [0.651, 2.138], [0.650, 2.10], [0.645, 1.849], [0.627, 1.648], [0.610, 1.45],
  [0.587, 1.246], [0.563, 1.10], [0.534, 0.945], [0.507, 0.88], [0.462, 0.815],
  [0.407, 0.785], [0.297, 0.75], [0.167, 0.727], [0, 0.722],
];
// 液体が入る内側の空間。器の内壁より少しだけ内へ寄せる（面が重なってちらつかないように）。
const LIQUID = [
  [0, 0.728], [0.16, 0.733], [0.29, 0.75], [0.40, 0.785], [0.455, 0.815], [0.50, 0.88],
  [0.527, 0.945], [0.556, 1.10], [0.580, 1.246], [0.603, 1.45], [0.620, 1.648],
  [0.638, 1.849], [0.643, 2.12],
];
const LEVEL_EMPTY = 0.73;
const LEVEL_FULL = 1.25;   // 参照フレームの液面の高さ
const STREAM_TOP = 3.4;    // 画面の外から注がれてくる

// ── 時間（秒）。仕様の Scene 2 = 0.6〜2.0秒 に合わせる ──────────────────
const T_STREAM_IN = 0.55;
const T_POUR = 0.6;
const T_FULL = 2.0;
const T_STREAM_OUT = 1.8;
const T_END = 3.0;

const clamp01 = (x) => Math.min(1, Math.max(0, x));
const easeOut = (x) => 1 - Math.pow(1 - clamp01(x), 2.2);

function smooth(pairs, n) {
  // 求心型の Catmull-Rom。一様型だと角（縁・脚の端）で行き過ぎて形が崩れる。
  const curve = new THREE.CatmullRomCurve3(pairs.map(([r, h]) => new THREE.Vector3(r, h, 0)), false, 'centripetal');
  return curve.getPoints(n).map((p) => new THREE.Vector2(Math.max(0, p.x), p.y));
}

function radiusAt(profile, h) {
  for (let i = 1; i < profile.length; i++) {
    const a = profile[i - 1], b = profile[i];
    if (h <= b.y) return a.x + (b.x - a.x) * ((h - a.y) / Math.max(b.y - a.y, 1e-6));
  }
  return profile[profile.length - 1].x;
}

/** グラスに映り込む「バー」。暖色のランプと縦長の面光源を暗い球の内側に置いて焼く。 */
function barEnvironment(renderer) {
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(
    new THREE.SphereGeometry(20, 32, 16),
    new THREE.MeshBasicMaterial({ color: 0x0b0806, side: THREE.BackSide }),
  ));
  const lamp = (hex, gain, x, y, z, size) => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(size, 16, 8),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(gain) }));
    m.position.set(x, y, z);
    env.add(m);
  };
  lamp(0xffb35c, 6, -5, 4, -6, 1.6);
  lamp(0xff9a3d, 5, 6, 5, -5, 1.4);
  lamp(0xffd49a, 8, 2, 9, 4, 2.2);
  lamp(0xffc27a, 3, -7, 2, 5, 1.2);
  // 縦長の面光源。製品写真のグラスに入る、あの長い縦の映り込みを作る。
  const strip = (hex, gain, x, y, z, w) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, 9),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(hex).multiplyScalar(gain), side: THREE.DoubleSide }));
    m.position.set(x, y, z);
    m.lookAt(0, 1, 0);
    env.add(m);
  };
  strip(0xfff0dc, 7, -4.5, 3, 3.5, 1.1);
  strip(0xffd9a8, 4, 4.8, 3.5, 2.5, 0.8);

  const pm = new THREE.PMREMGenerator(renderer);
  const tex = pm.fromScene(env, 0.02).texture;
  pm.dispose();
  env.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  return tex;
}

/**
 * 視線と面の角度で明るさを変える加算の光（フレネル）。
 *   invert=0: 縁ほど明るい —— ガラスの輪郭が光る
 *   invert=1: 正面ほど明るい —— 液体の中を光が抜けて、中央が明るく縁が暗く見える
 * 一様な色で塗ると、液体はオレンジ色の樹脂の塊に見える。
 */
function fresnel({ color, power = 2.5, strength = 1, invert = 0, planes = null, side = THREE.DoubleSide }) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(color) },
      uPower: { value: power },
      uStrength: { value: strength },
      uInvert: { value: invert },
    },
    vertexShader: `
      #include <common>
      #include <clipping_planes_pars_vertex>
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * normal);
        vV = normalize(cameraPosition - wp.xyz);
        vec4 mvPosition = viewMatrix * wp;
        #include <clipping_planes_vertex>
        gl_Position = projectionMatrix * mvPosition;
      }`,
    fragmentShader: `
      #include <common>
      #include <clipping_planes_pars_fragment>
      uniform vec3 uColor;
      uniform float uPower;
      uniform float uStrength;
      uniform float uInvert;
      varying vec3 vN;
      varying vec3 vV;
      void main() {
        #include <clipping_planes_fragment>
        float f = 1.0 - abs(dot(normalize(vN), normalize(vV)));
        f = pow(clamp(f, 0.0, 1.0), uPower);
        f = mix(f, 1.0 - f, uInvert);
        gl_FragColor = vec4(uColor * f * uStrength, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
    side,
    clipping: !!planes,
    clippingPlanes: planes,
  });
}

/** 台に落ちる琥珀色の光。暗い地の上でグラスを接地させる。 */
function poolTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,170,80,0.85)');
  grad.addColorStop(0.45, 'rgba(220,120,40,0.35)');
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/**
 * canvas に3Dグラスを描く。
 * @returns {{play(onDone?:Function):void, showFilled():void, setScale(k:number):void, dispose():void}}
 */
export function mount(canvas) {
  // 背景は不透明の黒。要素側の mix-blend-mode: screen で黒が消える。
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  renderer.setClearColor(0x000000, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.localClippingEnabled = true;

  const scene = new THREE.Scene();
  scene.environment = barEnvironment(renderer);

  const camera = new THREE.PerspectiveCamera(26, 540 / 766, 0.1, 50);
  camera.position.set(0, 2.0, 6.6);
  camera.lookAt(0, 1.02, 0);

  scene.add(new THREE.AmbientLight(0x2a1a10, 0.6));
  const key = new THREE.PointLight(0xffc98a, 8, 0, 2);
  key.position.set(2.2, 3.4, 3.0);
  scene.add(key);
  const back = new THREE.PointLight(0xff9a40, 10, 0, 2);
  back.position.set(-1.6, 1.4, -1.8);
  scene.add(back);

  // 器。黒地に加算合成なので、反射した光だけが足される。
  const shellGeo = new THREE.LatheGeometry(smooth(SHELL, 260), 160);
  const shellMat = new THREE.MeshPhysicalMaterial({
    color: 0x000000, roughness: 0.035, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.03,
    envMapIntensity: 1.7, specularIntensity: 1, ior: 1.5,
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
  });
  const shell = new THREE.Mesh(shellGeo, shellMat);
  shell.renderOrder = 3;
  scene.add(shell);
  // 映り込みだけだと、ランプが映らない場所ではガラスが消える。輪郭を常に薄く光らせる。
  const rim = new THREE.Mesh(shellGeo, fresnel({ color: 0xffe2bd, power: 4.5, strength: 0.32 }));
  rim.renderOrder = 4;
  scene.add(rim);

  // 液体。内側の空間を水平面で切り、液面の円盤で蓋をする。
  const liquidProfile = smooth(LIQUID, 120);
  const plane = new THREE.Plane(new THREE.Vector3(0, -1, 0), LEVEL_FULL);
  // 液体の地は暗く艶のある琥珀。明るさは下の「抜ける光」が担う。
  const liquidMat = new THREE.MeshPhysicalMaterial({
    color: 0x3a1806, roughness: 0.06, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.05,
    emissive: 0x241004, emissiveIntensity: 0.6, envMapIntensity: 1.5,
    transparent: true, opacity: 0.97, side: THREE.DoubleSide, clippingPlanes: [plane],
  });
  const liquidGeo = new THREE.LatheGeometry(liquidProfile, 160);
  const liquid = new THREE.Mesh(liquidGeo, liquidMat);
  liquid.renderOrder = 1;
  scene.add(liquid);
  // 正面ほど明るく縁ほど暗い光。厚みのある液体を後ろから光が抜けたときの見え方。
  const liquidGlow = new THREE.Mesh(liquidGeo, fresnel({
    color: 0xff8e2e, power: 1.4, strength: 0.75, invert: 1, planes: [plane], side: THREE.FrontSide,
  }));
  liquidGlow.renderOrder = 2;
  scene.add(liquidGlow);

  const surfaceGroup = new THREE.Group();
  const surface = new THREE.Mesh(
    new THREE.CircleGeometry(1, 96),
    new THREE.MeshPhysicalMaterial({
      color: 0x2a1004, emissive: 0x3a1404, emissiveIntensity: 0.55, roughness: 0.04,
      clearcoat: 1, envMapIntensity: 2.2, transparent: true, opacity: 0.97,
    }),
  );
  surface.rotation.x = -Math.PI / 2;
  surface.renderOrder = 2;
  surfaceGroup.add(surface);
  // 液面の縁の明るい線。実物のグラスでは表面張力で液がわずかに這い上がり、ここが光る。
  const meniscus = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.01, 8, 128),
    new THREE.MeshBasicMaterial({
      color: new THREE.Color(0xffb35a).multiplyScalar(1.6), transparent: true, opacity: 0.8,
      blending: THREE.AdditiveBlending, depthWrite: false,
    }),
  );
  meniscus.rotation.x = -Math.PI / 2;
  meniscus.renderOrder = 3;
  surfaceGroup.add(meniscus);
  scene.add(surfaceGroup);

  // 注がれる筋。原点を上端に置き、縦に伸び縮みさせる。
  // 実物の注ぎの筋は細く、芯だけが光って縁は透ける。太い棒にすると樹脂の柱に見える。
  const streamGeo = new THREE.CylinderGeometry(0.012, 0.016, 1, 16, 1, true);
  streamGeo.translate(0, -0.5, 0);
  const stream = new THREE.Mesh(streamGeo, fresnel({
    color: 0xffc27a, power: 1.2, strength: 1.4, invert: 1, side: THREE.FrontSide,
  }));
  stream.renderOrder = 1;
  stream.visible = false;
  scene.add(stream);

  const poolTex = poolTexture();
  const pool = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 1.3), new THREE.MeshBasicMaterial({
    map: poolTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, opacity: 0.35,
  }));
  pool.rotation.x = -Math.PI / 2;
  pool.position.set(0, 0.002, 0.35);
  pool.renderOrder = 0;
  scene.add(pool);

  const euler = new THREE.Euler();
  const normal = new THREE.Vector3();
  const point = new THREE.Vector3();

  /** 液面の高さ・傾き・注ぎの筋を反映する */
  function apply(level, tiltX, tiltZ, streamTop, streamBottom) {
    euler.set(tiltX, 0, tiltZ);
    normal.set(0, -1, 0).applyEuler(euler);
    point.set(0, level, 0);
    plane.setFromNormalAndCoplanarPoint(normal, point);

    const r = Math.max(0.01, radiusAt(liquidProfile, level) - 0.003);
    surfaceGroup.position.y = level;
    surfaceGroup.rotation.set(tiltX, 0, tiltZ);
    surface.scale.set(r, r, 1);
    meniscus.scale.set(r, r, r);
    surfaceGroup.visible = level > LEVEL_EMPTY + 0.004;
    liquid.visible = surfaceGroup.visible;

    const len = streamTop - streamBottom;
    stream.visible = len > 0.02;
    if (stream.visible) {
      stream.position.set(0.02, streamTop, 0);
      stream.scale.set(1, len, 1);
    }
  }

  let ratio = 1;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setPixelRatio(Math.min((devicePixelRatio || 1) * ratio, 3));
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    if (!raf) renderer.render(scene, camera);
  }

  let raf = 0;
  let t0 = 0;
  let done = null;

  function showFilled() {
    if (raf) cancelAnimationFrame(raf);
    raf = 0;
    apply(LEVEL_FULL, 0, 0, 0, 0);
    renderer.render(scene, camera);
  }

  function tick(now) {
    const t = (now - t0) / 1000;

    // 液面: 0.6〜2.0秒で満ち、着地で小さく行き過ぎて戻る
    let level = LEVEL_EMPTY + (LEVEL_FULL - LEVEL_EMPTY) * easeOut((t - T_POUR) / (T_FULL - T_POUR));
    if (t > T_FULL) level += 0.025 * Math.exp(-(t - T_FULL) * 5) * Math.sin((t - T_FULL) * 22);

    // 液面の揺れ: 注いでいる間は細かく波立ち、止むと減衰して落ち着く
    let tiltX = 0, tiltZ = 0;
    if (t > T_POUR) {
      const amp = t < T_FULL ? 0.035 : 0.035 * Math.exp(-(t - T_FULL) * 4.2);
      tiltX = amp * Math.sin(t * 17);
      tiltZ = amp * 0.7 * Math.sin(t * 13 + 1.3);
    }

    // 注ぎの筋: 上から伸びてきて液面に届き、最後は上端が液面まで下りて途切れる
    let top = STREAM_TOP, bottom = STREAM_TOP;
    if (t >= T_STREAM_IN) {
      bottom = STREAM_TOP - (STREAM_TOP - level) * easeOut((t - T_STREAM_IN) / 0.2);
      if (t >= T_STREAM_OUT) top = STREAM_TOP - (STREAM_TOP - level) * easeOut((t - T_STREAM_OUT) / 0.25);
    }
    stream.position.x = 0.02 + Math.sin(t * 13) * 0.004;

    apply(level, tiltX, tiltZ, top, bottom);
    renderer.render(scene, camera);

    if (t < T_END) {
      raf = requestAnimationFrame(tick);
    } else {
      // 終わったら描画を止める。止まっている絵のために毎フレーム描き続けない。
      raf = 0;
      showFilled();
      const cb = done;
      done = null;
      if (cb) cb();
    }
  }

  function play(onDone) {
    if (raf) cancelAnimationFrame(raf);
    done = onDone || null;
    apply(LEVEL_EMPTY, 0, 0, STREAM_TOP, STREAM_TOP);
    t0 = performance.now();
    raf = requestAnimationFrame(tick);
  }

  /** オープニング中は拡大表示されるので、そのぶん内部解像度を上げる */
  function setScale(k) {
    ratio = Math.max(1, k || 1);
    resize();
  }

  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  resize();
  showFilled();

  return {
    play,
    showFilled,
    setScale,
    dispose() {
      if (raf) cancelAnimationFrame(raf);
      ro.disconnect();
      scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
      poolTex.dispose();
      scene.environment.dispose();
      renderer.dispose();
    },
  };
}
