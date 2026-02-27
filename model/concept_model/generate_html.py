#!/usr/bin/env python3
"""
Generate ACDC Concept Model HTML visualization from JSON source.

This script reads acdc_concept_model.json and generates an interactive
D3.js force-directed graph visualization.

Usage:
    python generate_html.py
    python generate_html.py --output ACDC_Concept_Model_v4.html
"""

import json
import argparse
from pathlib import Path

def generate_html(json_path: str, output_path: str) -> None:
    """Generate HTML visualization from JSON model."""

    # Load JSON model
    with open(json_path, 'r', encoding='utf-8') as f:
        model = json.load(f)

    # Extract data (filter out _comment-only entries that lack required fields)
    nodes = [n for n in model['nodes'] if 'id' in n]
    links = [l for l in model['links'] if 's' in l]
    layers = model['layers']

    # Build layer colors mapping
    layer_colors = {k: v['color'] for k, v in layers.items()}

    # Generate HTML
    html = f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>AC/DC Concept Model v4</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:'Segoe UI',Arial,sans-serif;background:#0a0e17;color:#e0e6ed;overflow:hidden}}
#controls{{position:fixed;top:0;left:0;right:0;z-index:100;background:rgba(10,14,23,0.97);padding:8px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap;border-bottom:1px solid #1e2a3a}}
#controls h1{{font-size:15px;color:#7eb8f0;white-space:nowrap}}
#controls label{{font-size:11px;color:#8899aa}}
#controls select,#controls input{{background:#1a2233;color:#c0d0e0;border:1px solid #2a3a4a;padding:3px 7px;border-radius:4px;font-size:11px}}
#controls button{{background:#2b579a;color:white;border:none;padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px}}
#controls button:hover{{background:#3a6ab5}}
.legend{{display:flex;gap:10px;flex-wrap:wrap}}
.legend-item{{display:flex;align-items:center;gap:3px;font-size:10px;cursor:pointer;padding:2px 6px;border-radius:10px}}
.legend-item:hover{{background:rgba(255,255,255,0.05)}}
.legend-dot{{width:10px;height:10px;border-radius:50%}}
#detail-panel{{position:fixed;right:0;top:48px;width:420px;max-height:calc(100vh - 52px);background:rgba(12,16,26,0.98);border-left:1px solid #1e2a3a;padding:14px;overflow-y:auto;z-index:90;display:none;font-size:12px;line-height:1.5}}
#detail-panel h2{{color:#7eb8f0;font-size:14px;margin-bottom:6px}}
#detail-panel h3{{color:#5a9ad5;font-size:12px;margin:8px 0 3px}}
#detail-panel .badge{{display:inline-block;padding:1px 7px;border-radius:10px;font-size:10px;margin-right:3px}}
#detail-panel .close-btn{{position:absolute;top:6px;right:10px;cursor:pointer;color:#667;font-size:16px}}
#detail-panel table{{width:100%;border-collapse:collapse;margin-top:4px}}
#detail-panel th{{text-align:left;color:#5a9ad5;font-weight:600;padding:2px 5px;border-bottom:1px solid #1e2a3a;font-size:10px}}
#detail-panel td{{padding:2px 5px;font-size:10px;color:#b0bec5;border-bottom:1px solid #111822}}
#detail-panel td:first-child{{color:#e0e6ed;font-weight:500}}
#detail-panel .desc{{color:#8899aa;margin:6px 0;font-size:11px}}
#detail-panel .src{{font-size:9px;color:#556677}}
#detail-panel .supertype-note{{background:#1a2233;padding:6px 10px;border-radius:6px;margin:8px 0;font-size:11px;border-left:3px solid #5a9ad5}}
#stats{{position:fixed;bottom:10px;left:10px;font-size:10px;color:#556677;background:rgba(10,14,23,0.9);padding:5px 10px;border-radius:4px}}
svg{{display:block}}
.link{{stroke-opacity:0.55}}
.link-label{{font-size:7px;fill:#445566;pointer-events:none}}
.node-label{{font-size:9px;fill:#c0d0e0;pointer-events:none;text-anchor:middle;font-weight:500}}
.node-sublabel{{font-size:7px;fill:#667788;pointer-events:none;text-anchor:middle}}
.node-circle{{stroke-width:1.5;cursor:pointer;transition:filter 0.15s}}
.node-circle:hover{{stroke-width:3;filter:brightness(1.3) drop-shadow(0 0 6px rgba(126,184,240,0.4))}}
#tooltip{{position:fixed;padding:8px 12px;background:rgba(16,22,34,0.97);border:1px solid #2a3a5a;border-radius:6px;font-size:11px;pointer-events:none;display:none;z-index:200;max-width:320px;line-height:1.4}}
</style>
</head>
<body>
<div id="controls">
  <h1>AC / DC Concept Model v4</h1>
  <div><label>Layer:</label>
    <select id="layerFilter">
      <option value="ALL">All Layers</option>
      <option value="META">META - Unifying (Datum)</option>
      <option value="CROSS">CROSS - Cross-cutting</option>
      <option value="CONCEPT">CONCEPT - Shared Semantic</option>
      <option value="CO">CO - Collected Observation</option>
      <option value="CO_LEAF">CO_LEAF - Collection Concepts</option>
      <option value="DC">DC - Derivation Concept</option>
      <option value="DC_LEAF">DC_LEAF - Derivation Concepts</option>
      <option value="AC">AC - Analysis Concept</option>
      <option value="OUTPUT">OUTPUT - Analysis Outputs</option>
    </select></div>
  <div><label>Type:</label><select id="typeFilter"><option value="ALL">All</option></select></div>
  <div><label>Search:</label><input id="searchBox" placeholder="Search..." style="width:120px"></div>
  <button id="resetBtn">Reset</button>
  <button id="toggleLabels">Labels: ON</button>
  <button id="toggleRelLabels">Rels: OFF</button>
  <div class="legend">
    <div class="legend-item"><div class="legend-dot" style="background:#ffd54f"></div>META</div>
    <div class="legend-item"><div class="legend-dot" style="background:#78909c"></div>CROSS</div>
    <div class="legend-item"><div class="legend-dot" style="background:#a5d6a7"></div>CONCEPT</div>
    <div class="legend-item"><div class="legend-dot" style="background:#4fc3f7"></div>CO</div>
    <div class="legend-item"><div class="legend-dot" style="background:#80deea"></div>CO_LEAF</div>
    <div class="legend-item"><div class="legend-dot" style="background:#ff8a65"></div>DC</div>
    <div class="legend-item"><div class="legend-dot" style="background:#ffab91"></div>DC_LEAF</div>
    <div class="legend-item"><div class="legend-dot" style="background:#ce93d8"></div>AC</div>
    <div class="legend-item"><div class="legend-dot" style="background:#81c784"></div>OUTPUT</div>
  </div>
</div>
<div id="tooltip"></div>
<div id="detail-panel"><span class="close-btn" onclick="closePanel()">&times;</span><div id="detail-content"></div></div>
<div id="stats"></div>
<svg id="graph"></svg>
<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.8.5/d3.min.js"></script>
<script>

const layerColors = {json.dumps(layer_colors)};
const typeRadius = {{Supertype:22,Class:15,Attribute:10,Timing:10,Classification:10,Relationship:9,Context:11,QualityAttribute:9,Method:8,OutputConcept:12,SemanticConcept:9}};
const nodes = {json.dumps(nodes)};
const links = {json.dumps(links)};

// Stats
document.getElementById('stats').innerHTML = 'Nodes: ' + nodes.length + ' | Links: ' + links.length;

const nodeMap = {{}}; nodes.forEach(n => nodeMap[n.id]=n);
const simLinks = links.filter(l=>nodeMap[l.s]&&nodeMap[l.t]).map(l=>({{...l,source:l.s,target:l.t}}));

const tf = document.getElementById('typeFilter');
[...new Set(nodes.map(n=>n.nodeType))].sort().forEach(t=>{{const o=document.createElement('option');o.value=t;o.textContent=t;tf.appendChild(o);}});

const W=window.innerWidth, H=window.innerHeight;
const svg=d3.select('#graph').attr('width',W).attr('height',H);
const g=svg.append('g');
const zoom=d3.zoom().scaleExtent([0.1,5]).on('zoom',e=>g.attr('transform',e.transform));
svg.call(zoom);

svg.append('defs').selectAll('marker').data(['a']).join('marker')
  .attr('id','a').attr('viewBox','0 -5 10 10').attr('refX',22).attr('refY',0)
  .attr('markerWidth',5).attr('markerHeight',5).attr('orient','auto')
  .append('path').attr('d','M0,-4L10,0L0,4').attr('fill','#334455');

const sim=d3.forceSimulation(nodes)
  .force('link',d3.forceLink(simLinks).id(d=>d.id).distance(d=>d.type==='IS_A'?70:d.type==='PRODUCES'?50:110).strength(0.35))
  .force('charge',d3.forceManyBody().strength(-400))
  .force('center',d3.forceCenter(W/2,H/2))
  .force('collision',d3.forceCollide().radius(30))
  .force('x',d3.forceX(d=>({{META:W*0.5,CROSS:W*0.08,CONCEPT:W*0.38,CO:W*0.25,CO_LEAF:W*0.18,DC:W*0.50,DC_LEAF:W*0.58,AC:W*0.75,OUTPUT:W*0.92}}[d.layer]||W/2)).strength(0.12))
  .force('y',d3.forceY(d=>d.id==='DATUM'?H*0.08:d.layer==='CONCEPT'?H*0.35:d.layer==='CO_LEAF'?H*0.65:d.layer==='DC_LEAF'?H*0.65:d.nodeType==='OutputConcept'?H*0.7:H/2).strength(d=>d.layer==='META'?0.3:d.layer==='CONCEPT'||d.layer.endsWith('_LEAF')?0.08:0.02));

const linkG=g.append('g'), nodeG=g.append('g');

const linkEls=linkG.selectAll('line').data(simLinks).join('line').attr('class','link')
  .attr('stroke',d=>d.type==='IS_A'?'#ffd54f':d.type==='PRODUCES'?'#81c784':d.type.startsWith('HAS_')?'#5a9ad5':'#556677')
  .attr('stroke-width',d=>d.type==='IS_A'?2.5:d.type==='PRODUCES'?1.5:d.type.startsWith('HAS_')?1.5:1.2)
  .attr('stroke-dasharray',d=>d.card&&d.card.startsWith('0')?'4,3':'none')
  .attr('marker-end','url(#a)');

const linkLbls=linkG.selectAll('text').data(simLinks).join('text')
  .attr('class','link-label').text(d=>d.type).style('display','none');

const nodeEls=nodeG.selectAll('g').data(nodes).join('g')
  .call(d3.drag()
    .on('start',(e,d)=>{{if(!e.active)sim.alphaTarget(0.3).restart();d.fx=d.x;d.fy=d.y}})
    .on('drag',(e,d)=>{{d.fx=e.x;d.fy=e.y}})
    .on('end',(e,d)=>{{if(!e.active)sim.alphaTarget(0);d.fx=null;d.fy=null}}));

// Regular circles for most nodes
nodeEls.filter(d=>d.nodeType!=='SemanticConcept').append('circle').attr('class','node-circle')
  .attr('r',d=>typeRadius[d.nodeType]||10)
  .attr('fill',d=>layerColors[d.layer]||'#666')
  .attr('stroke',d=>d3.color(layerColors[d.layer]||'#666').brighter(0.6))
  .attr('fill-opacity',d=>d.nodeType==='Supertype'?0.9:d.nodeType==='OutputConcept'?0.85:0.75)
  .on('mouseover',showTip).on('mouseout',()=>{{document.getElementById('tooltip').style.display='none'}})
  .on('click',showDetail);

// Diamonds for shared semantic concepts (CONCEPT layer)
nodeEls.filter(d=>d.nodeType==='SemanticConcept'&&d.layer==='CONCEPT').append('path').attr('class','node-circle')
  .attr('d','M0,-12 L10,0 L0,12 L-10,0 Z')
  .attr('fill',d=>layerColors[d.layer]||'#666')
  .attr('stroke',d=>d3.color(layerColors[d.layer]||'#666').brighter(0.6))
  .attr('fill-opacity',0.85)
  .on('mouseover',showTip).on('mouseout',()=>{{document.getElementById('tooltip').style.display='none'}})
  .on('click',showDetail);

// Small hexagons for leaf concepts (CO_LEAF/DC_LEAF)
nodeEls.filter(d=>d.nodeType==='SemanticConcept'&&(d.layer==='CO_LEAF'||d.layer==='DC_LEAF')).append('path').attr('class','node-circle')
  .attr('d','M0,-8 L7,-4 L7,4 L0,8 L-7,4 L-7,-4 Z')
  .attr('fill',d=>layerColors[d.layer]||'#666')
  .attr('stroke',d=>d3.color(layerColors[d.layer]||'#666').brighter(0.6))
  .attr('fill-opacity',0.8)
  .on('mouseover',showTip).on('mouseout',()=>{{document.getElementById('tooltip').style.display='none'}})
  .on('click',showDetail);

const nLabels=nodeEls.append('text').attr('class','node-label')
  .attr('dy',d=>(typeRadius[d.nodeType]||10)+13).text(d=>d.name);
const nSub=nodeEls.append('text').attr('class','node-sublabel')
  .attr('dy',d=>(typeRadius[d.nodeType]||10)+23).text(d=>d.layer+' '+d.nodeType);

sim.on('tick',()=>{{
  linkEls.attr('x1',d=>d.source.x).attr('y1',d=>d.source.y).attr('x2',d=>d.target.x).attr('y2',d=>d.target.y);
  linkLbls.attr('x',d=>(d.source.x+d.target.x)/2).attr('y',d=>(d.source.y+d.target.y)/2);
  nodeEls.attr('transform',d=>'translate('+d.x+','+d.y+')');
}});

function showTip(e,d){{
  const tip=document.getElementById('tooltip');
  const pc=(d.props||[]).length;
  const rc=simLinks.filter(l=>(l.source.id||l.source)===d.id||(l.target.id||l.target)===d.id).length;
  tip.innerHTML='<div style="color:'+(layerColors[d.layer]||'#fff')+';font-weight:bold">'+d.name+'</div>'
    +'<div style="color:#667;font-size:10px">'+d.layer+' \\u00b7 '+d.nodeType+'</div>'
    +'<div style="margin-top:4px">'+d.desc.substring(0,220)+(d.desc.length>220?'...':'')+'</div>'
    +'<div style="color:#556;margin-top:3px;font-size:10px">'+pc+' props \\u00b7 '+rc+' rels</div>';
  tip.style.display='block';tip.style.left=(e.clientX+12)+'px';tip.style.top=(e.clientY-8)+'px';
}}

function closePanel(){{
  document.getElementById('detail-panel').style.display='none';
  nodeEls.select('.node-circle').attr('opacity',1);
  nLabels.attr('opacity',1);nSub.attr('opacity',1);
  linkEls.attr('opacity',0.55);
}}

function showDetail(e,d){{
  const panel=document.getElementById('detail-panel');
  const ct=document.getElementById('detail-content');
  const pr=d.props||[];
  const outR=simLinks.filter(l=>(l.source.id||l.source)===d.id);
  const inR=simLinks.filter(l=>(l.target.id||l.target)===d.id);
  let h='<h2>'+d.name+'</h2>'
    +'<span class="badge" style="background:'+(layerColors[d.layer]||'#666')+'33;color:'+(layerColors[d.layer]||'#fff')+'">'+d.layer+'</span>'
    +'<span class="badge" style="background:#2a3a4a;color:#90a4ae">'+d.nodeType+'</span>'
    +(d.statoCode?'<span class="badge" style="background:#2a4a3a;color:#81c784">'+d.statoCode+'</span>':'')
    +'<p class="desc">'+d.desc+'</p><p class="src">Source: '+d.source+'</p>';

  const parents=outR.filter(r=>r.type==='IS_A');
  const children=inR.filter(r=>r.type==='IS_A');
  if(parents.length||children.length){{
    h+='<div class="supertype-note">';
    if(parents.length) h+='<b>Is a:</b> '+parents.map(r=>{{const t=typeof r.target==='object'?r.target:nodeMap[r.target];return t?t.name:r.target}}).join(', ')+'<br>';
    if(children.length) h+='<b>Subtypes:</b> '+children.map(r=>{{const s=typeof r.source==='object'?r.source:nodeMap[r.source];return s?s.name:r.source}}).join(', ');
    h+='</div>';
  }}
  if(pr.length){{
    h+='<h3>Properties ('+pr.length+')</h3><table><tr><th>Name</th><th>Var</th><th>Type</th><th>Description</th></tr>';
    pr.forEach(p=>{{h+='<tr><td>'+p.n+'</td><td style="color:#7eb8f0">'+p.v+'</td><td>'+p.t+'</td><td>'+p.d+'</td></tr>'}});
    h+='</table>';
  }}
  const produces=outR.filter(r=>r.type==='PRODUCES');
  if(produces.length){{
    h+='<h3>Produces ('+produces.length+')</h3><table><tr><th>Output</th><th>Card</th></tr>';
    produces.forEach(r=>{{const tgt=typeof r.target==='object'?r.target:nodeMap[r.target];h+='<tr><td style="color:#81c784">'+(tgt?tgt.name:r.target)+'</td><td>'+r.card+'</td></tr>'}});
    h+='</table>';
  }}
  const producedBy=inR.filter(r=>r.type==='PRODUCES');
  if(producedBy.length){{
    h+='<h3>Produced By ('+producedBy.length+')</h3><table><tr><th>Method</th></tr>';
    producedBy.forEach(r=>{{const src=typeof r.source==='object'?r.source:nodeMap[r.source];h+='<tr><td style="color:#ce93d8">'+(src?src.name:r.source)+'</td></tr>'}});
    h+='</table>';
  }}
  const nonIsa=outR.filter(r=>r.type!=='IS_A'&&r.type!=='PRODUCES');
  if(nonIsa.length){{
    h+='<h3>Outgoing ('+nonIsa.length+')</h3><table><tr><th>Rel</th><th>To</th><th>Card</th></tr>';
    nonIsa.forEach(r=>{{const tgt=typeof r.target==='object'?r.target:nodeMap[r.target];h+='<tr><td style="color:#ff8a65">'+r.type+'</td><td>'+(tgt?tgt.name:r.target)+'</td><td>'+r.card+'</td></tr>'}});
    h+='</table>';
  }}
  const nonIsaIn=inR.filter(r=>r.type!=='IS_A'&&r.type!=='PRODUCES');
  if(nonIsaIn.length){{
    h+='<h3>Incoming ('+nonIsaIn.length+')</h3><table><tr><th>From</th><th>Rel</th><th>Card</th></tr>';
    nonIsaIn.forEach(r=>{{const src=typeof r.source==='object'?r.source:nodeMap[r.source];h+='<tr><td>'+(src?src.name:r.source)+'</td><td style="color:#4fc3f7">'+r.type+'</td><td>'+r.card+'</td></tr>'}});
    h+='</table>';
  }}
  ct.innerHTML=h;panel.style.display='block';

  const conn=new Set([d.id]);
  simLinks.forEach(l=>{{const s=l.source.id||l.source,t=l.target.id||l.target;if(s===d.id)conn.add(t);if(t===d.id)conn.add(s)}});
  nodeEls.select('.node-circle').attr('opacity',n=>conn.has(n.id)?1:0.15);
  nLabels.attr('opacity',n=>conn.has(n.id)?1:0.1);
  nSub.attr('opacity',n=>conn.has(n.id)?1:0.08);
  linkEls.attr('opacity',l=>{{const s=l.source.id||l.source,t=l.target.id||l.target;return(s===d.id||t===d.id)?0.9:0.08}});
}}

function applyFilters(){{
  const lv=document.getElementById('layerFilter').value;
  const tv=document.getElementById('typeFilter').value;
  const sv=document.getElementById('searchBox').value.toLowerCase();
  const vis=new Set();
  nodes.forEach(n=>{{
    if((lv==='ALL'||n.layer===lv)&&(tv==='ALL'||n.nodeType===tv)&&(!sv||n.name.toLowerCase().includes(sv)||n.desc.toLowerCase().includes(sv)))vis.add(n.id);
  }});
  if(lv!=='ALL'||tv!=='ALL'||sv)simLinks.forEach(l=>{{const s=l.source.id||l.source,t=l.target.id||l.target;if(vis.has(s)||vis.has(t)){{vis.add(s);vis.add(t)}}}});
  nodeEls.select('.node-circle').attr('opacity',n=>vis.has(n.id)?1:0.08);
  nLabels.attr('opacity',n=>vis.has(n.id)?1:0.06);nSub.attr('opacity',n=>vis.has(n.id)?1:0.04);
  linkEls.attr('opacity',l=>{{const s=l.source.id||l.source,t=l.target.id||l.target;return(vis.has(s)&&vis.has(t))?0.7:0.05}});
}}

document.getElementById('layerFilter').addEventListener('change',applyFilters);
document.getElementById('typeFilter').addEventListener('change',applyFilters);
document.getElementById('searchBox').addEventListener('input',applyFilters);
document.getElementById('resetBtn').addEventListener('click',()=>{{
  document.getElementById('layerFilter').value='ALL';document.getElementById('typeFilter').value='ALL';
  document.getElementById('searchBox').value='';closePanel();
  svg.transition().duration(500).call(zoom.transform,d3.zoomIdentity);
}});
let showL=true,showR=false;
document.getElementById('toggleLabels').addEventListener('click',function(){{showL=!showL;nLabels.style('display',showL?null:'none');nSub.style('display',showL?null:'none');this.textContent='Labels: '+(showL?'ON':'OFF')}});
document.getElementById('toggleRelLabels').addEventListener('click',function(){{showR=!showR;linkLbls.style('display',showR?null:'none');this.textContent='Rels: '+(showR?'ON':'OFF')}});
setTimeout(()=>{{svg.transition().duration(1000).call(zoom.transform,d3.zoomIdentity.translate(W/2,H/2).scale(0.55).translate(-W/2,-H/2))}},2000);

</script>
</body>
</html>
'''

    # Write output
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(html)

    print(f"Generated: {output_path}")
    print(f"  - Nodes: {len(nodes)}")
    print(f"  - Links: {len(links)}")
    print(f"  - Layers: {list(layers.keys())}")


def main():
    parser = argparse.ArgumentParser(description='Generate ACDC Concept Model HTML from JSON')
    parser.add_argument('--input', '-i', default='acdc_concept_model.json',
                        help='Input JSON file (default: acdc_concept_model.json)')
    parser.add_argument('--output', '-o', default='ACDC_Concept_Model_v4.html',
                        help='Output HTML file (default: ACDC_Concept_Model_v4.html)')
    args = parser.parse_args()

    # Resolve paths relative to script location
    script_dir = Path(__file__).parent
    json_path = script_dir / args.input
    output_path = script_dir / args.output

    if not json_path.exists():
        print(f"Error: Input file not found: {json_path}")
        return 1

    generate_html(str(json_path), str(output_path))
    return 0


if __name__ == '__main__':
    exit(main())
