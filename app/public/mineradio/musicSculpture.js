/*
 * Rest/target distance-weighted deformation adapted from Tiago Canzian's
 * Interactive Particles Music Visualizer, Copyright (c) 2009-2022 Codrops (MIT).
 * https://github.com/tgcnzn/Interactive-Particles-Music-Visualizer/blob/main/src/js/entities/glsl/vertex.glsl
 * Source blob: 04b7416a98babbbe3e4a3c1b1060c161017e4617
 * Full license: app/UPSTREAM-NOTICE.md.
 * Changes: preserve MineRadio forms, use host spatial peaks, cap displacement,
 * add separate quiet ambience, and omit the upstream curl/noise implementation.
 */
(function () {
  uniforms.uMusicRegions = { value: new Float32Array(16) };
  uniforms.uMusicLive = { value: 0 };
  uniforms.uAmbientActivity = { value: 0 };
  var header = '\nuniform float uMusicRegions[16];\nuniform float uMusicLive, uAmbientActivity;\n' +
    'float musicRegion(vec3 p) {\n' +
    '  float sector = fract(atan(p.y,p.x) / 6.2831853 + 1.0) * 16.0;\n' +
    '  float value = 0.0;\n' +
    '  for(int i=0;i<16;i++){ float d=abs(sector-float(i)); d=min(d,16.0-d); value += uMusicRegions[i] * (1.0-smoothstep(0.0,1.4,d)); }\n' +
    '  return min(1.0,value);\n}\n';
  var deform = '\nif(uMusicLive > 0.001) {\n' +
    '  float crest = min(1.0,musicRegion(pos)*0.86+uBeat*0.14) * clamp(uIntensity,0.0,1.5);\n' +
    '  vec3 restPosition = pos;\n' +
    '  vec3 targetPosition = pos + normalize(vec3(pos.xy,0.4)) * min(0.44,crest*0.44);\n' +
    '  if(uPreset > 11.5) targetPosition.z += min(0.30,crest*0.30);\n' +
    '  float deformationDistance = min(1.0,length(restPosition-targetPosition)/0.55);\n' +
    '  pos = mix(restPosition,targetPosition,pow(deformationDistance,0.7));\n' +
    '  vColor = mix(vColor,vec3(0.88,0.93,0.86),min(0.16,crest*0.16));\n' +
    '}\n' +
    'if(uAmbientActivity > 0.001) {\n' +
    '  float phase = atan(pos.y,pos.x)*2.0;\n' +
    '  pos.z += sin(uTime*0.31+phase) * 0.045 * uAmbientActivity;\n' +
    '  vColor = mix(vColor,vec3(0.78,0.85,0.88),(0.5+0.5*sin(uTime*0.24+phase))*0.035*uAmbientActivity);\n' +
    '}\n';
  [material, bloomMaterial].forEach(function (shader) {
    var marker = '  if (uScatter > 0.001) {';
    if (!shader.vertexShader.includes(marker)) throw new Error('Music sculpture deformation anchor is missing');
    shader.vertexShader = header + shader.vertexShader.replace(marker, deform + marker);
    shader.needsUpdate = true;
  });
})();
