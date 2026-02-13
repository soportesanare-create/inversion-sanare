(() => {
  const D = window.SANARE_DATA;
  const fmtMXN = (n) => new Intl.NumberFormat("es-MX",{style:"currency",currency:"MXN",maximumFractionDigits:0}).format(n);
  const fmtPct = (p) => new Intl.NumberFormat("es-MX",{style:"percent",maximumFractionDigits:1}).format(p);
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  // Scenario model (simple): scale sales, keep COGS proportional via base gross margin,
  // marketing = % of sales, keep non-marketing OPEX fixed per year (derived from base OPEX - 10% base marketing)
  function computeScenario(salesFactor, mktPct){
    return D.years.map(y => {
      const sales = y.sales * salesFactor;
      const cogs  = sales * (1 - y.grossMargin);
      const grossProfit = sales - cogs;

      const marketing = sales * mktPct;
      const opexNonMkt = y.opex - (y.sales * 0.10); // base marketing assumption 10% of base sales
      const opex = opexNonMkt + marketing;

      const opProfit = grossProfit - opex;
      const opMargin = opProfit / (sales || 1);

      return { year:y.year, sales, grossProfit, grossMargin:grossProfit/(sales||1), opex, opProfit, opMargin };
    });
  }

  // ---------- SVG helpers (no libraries, offline) ----------
  function svgEl(tag, attrs={}){
    const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
    for(const [k,v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
  }

  function clearHost(id){
    const host = document.getElementById(id);
    if(host) host.innerHTML = "";
    return host;
  }

  function renderBarChart(hostId, series, opts){
    const host = clearHost(hostId);
    if(!host) return;

    const W = Math.max(520, host.clientWidth || 520);
    const H = 260;
    const pad = {l:50, r:18, t:14, b:36};

    const values = series.map(s=>s.value);
    const maxV = Math.max(...values, 0) || 1;
    const minV = Math.min(...values, 0);
    const hasNeg = minV < 0;

    const top = maxV * 1.08;
    const bottom = hasNeg ? minV * 1.08 : 0;

    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const x0 = pad.l, y0 = pad.t;

    const svg = svgEl("svg",{width:"100%", viewBox:`0 0 ${W} ${H}`, role:"img", "aria-label":opts.aria || "Gráfica"});
    svg.appendChild(svgEl("rect",{x:0,y:0,width:W,height:H,fill:"#ffffff",rx:16,ry:16}));

    const steps = 4;
    for(let i=0;i<=steps;i++){
      const yy = y0 + (plotH/steps)*i;
      svg.appendChild(svgEl("line",{x1:x0,y1:yy,x2:x0+plotW,y2:yy,stroke:"#e2e8f0","stroke-width":"1"}));
      const v = bottom + (top-bottom)*(1 - i/steps);
      const txt = svgEl("text",{x:x0-10,y:yy+4,"text-anchor":"end",fill:"#475569","font-size":"10"});
      txt.textContent = opts.yTick ? opts.yTick(v) : String(Math.round(v));
      svg.appendChild(txt);
    }

    const yScale = (v) => {
      const t = (v - bottom) / (top - bottom || 1);
      return y0 + plotH - t*plotH;
    };

    if(hasNeg){
      const yz = yScale(0);
      svg.appendChild(svgEl("line",{x1:x0,y1:yz,x2:x0+plotW,y2:yz,stroke:"#94a3b8","stroke-width":"1"}));
    }

    const barGap = 10;
    const barW = (plotW - barGap*(series.length-1)) / series.length;

    series.forEach((s,i)=>{
      const x = x0 + i*(barW+barGap);
      const yv = yScale(s.value);
      const yZero = yScale(0);
      const y = Math.min(yv, yZero);
      const h = Math.abs(yv - yZero);

      svg.appendChild(svgEl("rect",{
        x, y, width:barW, height:Math.max(1,h),
        rx:10, ry:10,
        fill: s.color || "rgba(14,165,233,.55)",
        stroke:"rgba(2,132,199,.25)",
        "stroke-width":"1"
      }));

      const vtxt = svgEl("text",{
        x: x + barW/2,
        y: (s.value >= 0) ? (y - 6) : (y + h + 14),
        "text-anchor":"middle",
        fill:"#0f172a",
        "font-size":"10",
        "font-weight":"700"
      });
      vtxt.textContent = opts.valueLabel ? opts.valueLabel(s.value) : String(Math.round(s.value));
      svg.appendChild(vtxt);

      const xtxt = svgEl("text",{
        x: x + barW/2,
        y: y0 + plotH + 22,
        "text-anchor":"middle",
        fill:"#475569",
        "font-size":"11"
      });
      xtxt.textContent = s.label;
      svg.appendChild(xtxt);
    });

    host.appendChild(svg);
  }

  function renderLineChart(hostId, xLabels, lines, opts){
    const host = clearHost(hostId);
    if(!host) return;

    const W = Math.max(520, host.clientWidth || 520);
    const H = 260;
    const pad = {l:50, r:18, t:16, b:36};

    const all = [];
    lines.forEach(L => L.values.forEach(v => all.push(v)));
    const minV = Math.min(...all);
    const maxV = Math.max(...all);
    const range = (maxV - minV) || 1;
    const top = maxV + range*0.12;
    const bottom = minV - range*0.12;

    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const x0 = pad.l, y0 = pad.t;

    const svg = svgEl("svg",{width:"100%", viewBox:`0 0 ${W} ${H}`, role:"img", "aria-label":opts.aria || "Gráfica"});
    svg.appendChild(svgEl("rect",{x:0,y:0,width:W,height:H,fill:"#ffffff",rx:16,ry:16}));

    const steps = 4;
    for(let i=0;i<=steps;i++){
      const yy = y0 + (plotH/steps)*i;
      svg.appendChild(svgEl("line",{x1:x0,y1:yy,x2:x0+plotW,y2:yy,stroke:"#e2e8f0","stroke-width":"1"}));
      const v = top - (top-bottom)*(i/steps);
      const txt = svgEl("text",{x:x0-10,y:yy+4,"text-anchor":"end",fill:"#475569","font-size":"10"});
      txt.textContent = opts.yTick ? opts.yTick(v) : v.toFixed(0);
      svg.appendChild(txt);
    }

    const yScale = (v)=> {
      const t=(v-bottom)/(top-bottom || 1);
      return y0 + plotH - t*plotH;
    };
    const xScale = (i)=> x0 + (plotW * (i/(xLabels.length-1 || 1)));

    // x labels
    xLabels.forEach((lab, i)=>{
      const x = xScale(i);
      const txt = svgEl("text",{x, y:y0+plotH+22, "text-anchor":"middle", fill:"#475569","font-size":"11"});
      txt.textContent = lab;
      svg.appendChild(txt);
    });

    // legend (top-left)
    lines.forEach((L, li)=>{
      const lx = x0 + li*170;
      const ly = 18;
      svg.appendChild(svgEl("line",{x1:lx,y1:ly,x2:lx+18,y2:ly,stroke:L.color,"stroke-width":"3"}));
      const lt = svgEl("text",{x:lx+24,y:ly+4,fill:"#334155","font-size":"11","font-weight":"700"});
      lt.textContent = L.name;
      svg.appendChild(lt);
    });

    // draw lines + points
    lines.forEach((L)=>{
      const path = [];
      L.values.forEach((v,i)=>{
        const x=xScale(i), y=yScale(v);
        path.push((i===0?"M":"L")+x.toFixed(1)+","+y.toFixed(1));
      });
      svg.appendChild(svgEl("path",{d:path.join(" "), fill:"none", stroke:L.color, "stroke-width":"3", "stroke-linecap":"round", "stroke-linejoin":"round"}));
      L.values.forEach((v,i)=>{
        const x=xScale(i), y=yScale(v);
        svg.appendChild(svgEl("circle",{cx:x, cy:y, r:4, fill:"#ffffff", stroke:L.color, "stroke-width":"2"}));
      });
    });

    host.appendChild(svg);
  }

  function renderStackedPercentBars(hostId, rows, opts){
    const host = clearHost(hostId);
    if(!host) return;

    const W = Math.max(640, host.clientWidth || 640);
    const H = 260;
    const pad = {l:70, r:18, t:18, b:40};
    const plotW = W - pad.l - pad.r;
    const plotH = H - pad.t - pad.b;
    const x0 = pad.l, y0 = pad.t;

    const svg = svgEl("svg",{width:"100%", viewBox:`0 0 ${W} ${H}`, role:"img", "aria-label":opts.aria || "Gráfica"});
    svg.appendChild(svgEl("rect",{x:0,y:0,width:W,height:H,fill:"#ffffff",rx:16,ry:16}));

    const colors = opts.colors;
    const partNames = opts.parts;
    const yStep = plotH / rows.length;
    const barH = yStep * 0.55;

    rows.forEach((r, idx)=>{
      const cy = y0 + yStep*idx + yStep/2;
      const y = cy - barH/2;

      const ylab = svgEl("text",{x:x0-12,y:cy+4,"text-anchor":"end",fill:"#475569","font-size":"11"});
      ylab.textContent = r.label;
      svg.appendChild(ylab);

      let accX = x0;
      r.parts.forEach((p, j)=>{
        const w = plotW * clamp(p,0,1);
        svg.appendChild(svgEl("rect",{x:accX,y,width:w,height:barH,rx:10,ry:10,fill:colors[j]}));
        if (w >= 44){
          const t = svgEl("text",{x:accX + w/2, y:cy+4, "text-anchor":"middle", fill:"#0f172a","font-size":"10","font-weight":"700"});
          t.textContent = Math.round(p*100) + "%";
          svg.appendChild(t);
        }
        accX += w;
      });
      svg.appendChild(svgEl("rect",{x:x0,y,width:plotW,height:barH,rx:10,ry:10,fill:"none",stroke:"#e2e8f0","stroke-width":"1"}));
    });

    // legend
    partNames.forEach((name, i)=>{
      const lx = x0 + i*180;
      const ly = H - 18;
      svg.appendChild(svgEl("rect",{x:lx,y:ly-10,width:14,height:10,fill:colors[i],rx:2,ry:2}));
      const txt = svgEl("text",{x:lx+20,y:ly-2,fill:"#475569","font-size":"11"});
      txt.textContent = name;
      svg.appendChild(txt);
    });

    host.appendChild(svg);
  }

  // ---------- checklist mount ----------
  function mountQuestions(){
    const C = D.checklist;
    const mount = (id, arr, prefix) => {
      const host = document.getElementById(id);
      host.innerHTML = arr.map((t,i)=>{
        const qid = `${prefix}_${i}`;
        return `<div class="q"><input type="checkbox" id="${qid}"><label for="${qid}">${t}</label></div>`;
      }).join("");
    };
    mount("q_market", C.market, "mkt");
    mount("q_unit",   C.unit,   "uni");
    mount("q_mkt",    C.mkt,    "mar");
    mount("q_ops",    C.ops,    "ops");
    mount("q_reg",    C.reg,    "reg");
    mount("q_fin",    C.fin,    "fin");
  }

  // ---------- tabs ----------
  function initTabs(){
    const tabs = Array.from(document.querySelectorAll(".tab"));
    const panes = Array.from(document.querySelectorAll(".pane"));
    const setTab = (id) => {
      tabs.forEach(t=>{
        const active = t.dataset.tab === id;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", active ? "true" : "false");
      });
      panes.forEach(p=> p.style.display = (p.id === id) ? "" : "none");
      document.querySelector(".main").scrollIntoView({behavior:"smooth", block:"start"});
    };
    tabs.forEach(t=> t.addEventListener("click", ()=> setTab(t.dataset.tab)));
  }

  // ---------- download helpers ----------
  function downloadBlob(filename, blob){
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  function exportCSV(rows, salesFactor, mktPct){
    const header = ["Año","Ventas","UtilidadBruta","MargenBruto","GastoOperativo","UtilidadOperativa","MargenOperativo"];
    const lines = [
      header.join(","),
      ...rows.map(r=>[
        r.year,
        r.sales.toFixed(0),
        r.grossProfit.toFixed(0),
        (r.grossMargin*100).toFixed(2)+"%",
        r.opex.toFixed(0),
        r.opProfit.toFixed(0),
        (r.opMargin*100).toFixed(2)+"%"
      ].join(","))
    ];
    downloadBlob(`sanare_kpis_${salesFactor.toFixed(2)}x_mkt${Math.round(mktPct*100)}.csv`,
      new Blob([lines.join("\\n")], {type:"text/csv;charset=utf-8"})
    );
  }

  function exportChecklist(){
    const checks = Array.from(document.querySelectorAll('input[type="checkbox"]'));
    const lines = [];
    lines.push("SANARÉ — Checklist de Due Diligence (Preguntas para invertir)");
    lines.push("------------------------------------------------------------");
    checks.forEach(ch=>{
      const label = document.querySelector(`label[for="${ch.id}"]`);
      if(!label) return;
      lines.push(`${ch.checked ? "[x]" : "[ ]"} ${label.textContent}`);
    });
    downloadBlob("checklist_inversion_sanare.txt",
      new Blob([lines.join("\\n")], {type:"text/plain;charset=utf-8"})
    );
  }

  // ---------- render ----------
  function render(){
    const salesFactor = parseFloat(document.getElementById("salesFactor").value);
    const mktPct = parseFloat(document.getElementById("mktPct").value);

    document.getElementById("salesFactorVal").textContent = salesFactor.toFixed(2) + "x";
    document.getElementById("mktPctVal").textContent = Math.round(mktPct*100) + "%";

    const rows = computeScenario(salesFactor, mktPct);

    const byYear = Object.fromEntries(rows.map(r=>[r.year,r]));
    document.getElementById("k_sales_2026").textContent = fmtMXN(byYear[2026].sales);
    document.getElementById("k_sales_2027").textContent = fmtMXN(byYear[2027].sales);
    document.getElementById("k_sales_2028").textContent = fmtMXN(byYear[2028].sales);

    let be = D.breakEven.base;
    if (salesFactor <= 0.85) be = D.breakEven.minus20;
    document.getElementById("noteBE").innerHTML =
      `<b>Lectura rápida:</b> Break-even mensual aproximado: <b>${be}</b> (sensibilidad simple).<br/>` +
      `Valida capacidad (sillas/turnos/personal), conversión comercial, mix de pago y márgenes por línea antes de invertir.`;

    const tb = document.getElementById("kpiTable");
    tb.innerHTML = rows.map(r=>`
      <tr>
        <td><b>${r.year}</b></td>
        <td class="num">${fmtMXN(r.sales)}</td>
        <td class="num">${fmtMXN(r.grossProfit)}</td>
        <td class="num">${fmtPct(r.grossMargin)}</td>
        <td class="num">${fmtMXN(r.opex)}</td>
        <td class="num"><b>${fmtMXN(r.opProfit)}</b></td>
        <td class="num"><b>${fmtPct(r.opMargin)}</b></td>
      </tr>
    `).join("");

    renderBarChart("chart_sales",
      rows.map(r=>({label:String(r.year), value:r.sales})),
      { aria:"Ventas por año", yTick:(v)=> (v/1e6).toFixed(0)+"M", valueLabel:(v)=> (v/1e6).toFixed(0)+"M" }
    );

    renderBarChart("chart_op",
      rows.map(r=>({label:String(r.year), value:r.opProfit})),
      { aria:"Utilidad operativa por año", yTick:(v)=> (v/1e6).toFixed(0)+"M", valueLabel:(v)=> (v/1e6).toFixed(0)+"M" }
    );

    renderLineChart("chart_margins",
      rows.map(r=>String(r.year)),
      [
        { name:"Margen bruto", values: rows.map(r=>r.grossMargin*100), color:"rgba(14,165,233,.85)" },
        { name:"Margen operativo", values: rows.map(r=>r.opMargin*100), color:"rgba(245,158,11,.80)" }
      ],
      { aria:"Márgenes (%)", yTick:(v)=> v.toFixed(0)+"%" }
    );

    renderBarChart("chart_opex",
      rows.map(r=>({label:String(r.year), value:r.opex})),
      { aria:"OPEX por año", yTick:(v)=> (v/1e6).toFixed(0)+"M", valueLabel:(v)=> (v/1e6).toFixed(0)+"M" }
    );

    renderStackedPercentBars("chart_opex_mix",
      D.opexMix.map(m=>({label:String(m.year), parts:[m.marketing, m.payroll, m.rent]})),
      {
        aria:"Mix de OPEX por año",
        parts:["Marketing","Nómina","Renta"],
        colors:["rgba(14,165,233,.55)","rgba(148,163,184,.60)","rgba(245,158,11,.45)"]
      }
    );

    // bind buttons
    document.getElementById("btnCSV").onclick = () => exportCSV(rows, salesFactor, mktPct);
    document.getElementById("btnCSV2").onclick = () => exportCSV(rows, salesFactor, mktPct);
  }

  function init(){
    document.getElementById("today").textContent = new Date().toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"});
    initTabs();
    mountQuestions();

    document.getElementById("salesFactor").addEventListener("input", render);
    document.getElementById("mktPct").addEventListener("input", render);

    document.getElementById("btnPrint").addEventListener("click", ()=> window.print());
    document.getElementById("btnChecklist").addEventListener("click", exportChecklist);

    render();

    window.addEventListener("resize", () => {
      clearTimeout(window.__rz);
      window.__rz = setTimeout(render, 120);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();