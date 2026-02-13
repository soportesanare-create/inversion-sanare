const SANARE_DASH_VERSION = 'v12'; console.log('Sanare dashboard', SANARE_DASH_VERSION);
(() => {
  const D = window.SANARE_DATA;
  const fmtMoney = (n) => new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
  const fmtMXN = (n) => (n===null || !isFinite(n)) ? "—" : ("$" + fmtMoney(n));
  const fmtPct = (p) => new Intl.NumberFormat("en-US",{style:"percent",maximumFractionDigits:1}).format(p);
  const fmtNum = (n) => new Intl.NumberFormat("en-US",{minimumFractionDigits:2,maximumFractionDigits:2}).format(n);
  const parseNum = (v, fallback=0) => {
    if(v===null || v===undefined) return fallback;
    if(typeof v === "number") return isFinite(v) ? v : fallback;
    const s = String(v).trim().replace(/\$/g,"").replace(/\s+/g,"").replace(/,/g,"");
    const x = parseFloat(s);
    return isFinite(x) ? x : fallback;
  };
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));

  // ---------- sedes: presets "escenario ideal" por # de sedes ----------
  // Puedes ajustar estos supuestos para que reflejen tu realidad (capex, ventas por sede, opex, etc.).
  const SITE_PRESETS = [
    { min: 1, max: 2, capex: 6500000, wc: 1800000, salesPerSiteM: 2200000, gm: 0.36, opexPerSiteM: 1150000, corpOpexM: 650000, daPct: 0.035, growth: 0.10, years: 5 },
    { min: 3, max: 4, capex: 6000000, wc: 1500000, salesPerSiteM: 2500000, gm: 0.38, opexPerSiteM: 1200000, corpOpexM: 500000, daPct: 0.030, growth: 0.10, years: 5 },
    { min: 5, max: 6, capex: 5800000, wc: 1500000, salesPerSiteM: 2750000, gm: 0.40, opexPerSiteM: 1250000, corpOpexM: 550000, daPct: 0.030, growth: 0.10, years: 6 },
    { min: 7, max: 10, capex: 5600000, wc: 1500000, salesPerSiteM: 3000000, gm: 0.40, opexPerSiteM: 1300000, corpOpexM: 600000, daPct: 0.030, growth: 0.10, years: 6 },
  ];
  const pickSitePreset = (n) => SITE_PRESETS.find(p => n>=p.min && n<=p.max) || SITE_PRESETS[SITE_PRESETS.length-1];
  const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

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

      const da = sales * (("daPct" in y) ? y.daPct : 0.03);
      const ebitda = opProfit + da;
      const ebitdaMargin = ebitda / (sales || 1);

      return { year:y.year, sales, grossProfit, grossMargin:grossProfit/(sales||1), opex, opProfit, opMargin, da, ebitda, ebitdaMargin };
    });
  }

  // ---------- inversión / payback (aprox) ----------
  function computeExtendedFCF(rows, fcfConv, extraYears, gAfter){
    const base = rows.map(r => ({ year: r.year, fcf: r.opProfit * fcfConv }));
    let lastYear = base[base.length - 1].year;
    let lastFCF  = base[base.length - 1].fcf;
    for(let i=0;i<extraYears;i++){
      lastYear += 1;
      lastFCF = lastFCF * (1 + gAfter);
      base.push({ year:lastYear, fcf:lastFCF });
    }
    return base;
  }

  function findPaybackMonthly(fcfSeries, investment, discRate, discounted){
    let cum = -investment;
    let t = 0; // months from t=0
    for(const y of fcfSeries){
      const monthly = y.fcf / 12;
      for(let m=0;m<12;m++){
        const df = discounted ? 1 / Math.pow(1 + discRate, t/12) : 1;
        cum += monthly * df;
        if(cum >= 0){
          return { year:y.year, month:m, monthsFromStart:t, cum };
        }
        t += 1;
      }
    }
    return null;
  }

  function npvMonthly(fcfSeries, investment, discRate){
    let npv = -investment;
    let t = 0;
    for(const y of fcfSeries){
      const monthly = y.fcf / 12;
      for(let m=0;m<12;m++){
        const df = 1 / Math.pow(1 + discRate, t/12);
        npv += monthly * df;
        t += 1;
      }
    }
    return npv;
  }

  function irrAnnual(fcfSeries, investment){
    const cfs = [-investment, ...fcfSeries.map(x=>x.fcf)];
    const npv = (r) => {
      let s = cfs[0];
      for(let i=1;i<cfs.length;i++) s += cfs[i] / Math.pow(1 + r, i);
      return s;
    };
    let lo = -0.9, hi = 5.0;
    let fLo = npv(lo), fHi = npv(hi);
    if(!isFinite(fLo) || !isFinite(fHi) || fLo * fHi > 0) return null;
    for(let i=0;i<90;i++){
      const mid = (lo + hi) / 2;
      const fMid = npv(mid);
      if(Math.abs(fMid) < 1e-6) return mid;
      if(fLo * fMid <= 0){ hi = mid; fHi = fMid; }
      else { lo = mid; fLo = fMid; }
    }
    return (lo + hi) / 2;
  }

  function cumByYearSimple(fcfSeries, investment){
    let cum = -investment;
    const labels = [`Inicio ${fcfSeries[0].year}`];
    const values = [cum];
    for(const y of fcfSeries){
      cum += y.fcf;
      labels.push(`Fin ${y.year}`);
      values.push(cum);
    }
    return {labels, values};
  }

  function cumByYearDiscounted(fcfSeries, investment, discRate){
    let cum = -investment;
    const labels = [`Inicio ${fcfSeries[0].year}`];
    const values = [cum];
    for(let i=0;i<fcfSeries.length;i++){
      const y = fcfSeries[i];
      const df = 1 / Math.pow(1 + discRate, i+1);
      cum += y.fcf * df;
      labels.push(`Fin ${y.year}`);
      values.push(cum);
    }
    return {labels, values};
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


    
    // ---- interactividad: tooltip al pasar el cursor ----
    const n = series.length;
    const overlay = svgEl("rect",{x:x0,y:y0,width:plotW,height:plotH,fill:"transparent"});
    overlay.style.cursor = "crosshair";

    const vLine = svgEl("line",{x1:x0,y1:y0,x2:x0,y2:y0+plotH,stroke:"#94a3b8","stroke-width":"1","stroke-dasharray":"4 4",opacity:"0"});
    svg.appendChild(vLine);

    const tipG = svgEl("g",{opacity:"0"});
    const tipRect = svgEl("rect",{x:0,y:0,width:10,height:10,rx:10,ry:10,fill:"rgba(15,23,42,.92)"});
    const tipText1 = svgEl("text",{x:0,y:0,fill:"#ffffff","font-size":"11","font-weight":"700"});
    const tipText2 = svgEl("text",{x:0,y:0,fill:"#e2e8f0","font-size":"10"});
    tipG.appendChild(tipRect);
    tipG.appendChild(tipText1);
    tipG.appendChild(tipText2);
    svg.appendChild(tipG);

    function setTipBox(lines){
      const maxLen = Math.max(...lines.map(s=>String(s).length));
      const w = Math.max(150, maxLen*7 + 22);
      const h = 52;
      tipRect.setAttribute("width", w);
      tipRect.setAttribute("height", h);
      return {w,h};
    }

    function showAt(idx){
      idx = clamp(idx,0,n-1);
      const s = series[idx];

      const cx = x0 + idx*(barW+barGap) + barW/2;
      vLine.setAttribute("x1", cx);
      vLine.setAttribute("x2", cx);
      vLine.setAttribute("opacity", "1");

      const l1 = s.label;
      const valTxt = (opts.valueLabel ? opts.valueLabel(s.value) : String(Math.round(s.value)));
      const l2 = `Valor: ${valTxt}`;

      const dims = setTipBox([l1,l2]);

      const yv = yScale(s.value);
      let tx = cx + 12;
      let ty = yv - dims.h/2;

      if(tx + dims.w > W - 8) tx = cx - dims.w - 12;
      ty = clamp(ty, 8, H - dims.h - 8);

      tipRect.setAttribute("x", tx);
      tipRect.setAttribute("y", ty);

      tipText1.textContent = l1;
      tipText2.textContent = l2;

      tipText1.setAttribute("x", tx + 11);
      tipText1.setAttribute("y", ty + 22);
      tipText2.setAttribute("x", tx + 11);
      tipText2.setAttribute("y", ty + 40);

      tipG.setAttribute("opacity","1");
    }

    function hideTip(){
      tipG.setAttribute("opacity","0");
      vLine.setAttribute("opacity","0");
    }

    overlay.addEventListener("mousemove", (e)=>{
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const idx = Math.floor((loc.x - x0) / (barW + barGap));
      showAt(idx);
    });
    overlay.addEventListener("mouseleave", hideTip);

    overlay.addEventListener("touchstart", (e)=>{
      const t = e.touches[0];
      const pt = svg.createSVGPoint();
      pt.x = t.clientX; pt.y = t.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const idx = Math.floor((loc.x - x0) / (barW + barGap));
      showAt(idx);
    }, {passive:true});
    overlay.addEventListener("touchend", hideTip);

    svg.appendChild(overlay);


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


    // ---- interactividad: tooltip al pasar el cursor ----
    const n = xLabels.length;
    const overlay = svgEl("rect",{x:x0,y:y0,width:plotW,height:plotH,fill:"transparent"});
    overlay.style.cursor = "crosshair";

    const vLine = svgEl("line",{x1:x0,y1:y0,x2:x0,y2:y0+plotH,stroke:"#94a3b8","stroke-width":"1","stroke-dasharray":"4 4",opacity:"0"});
    svg.appendChild(vLine);

    const tipG = svgEl("g",{opacity:"0"});
    const tipRect = svgEl("rect",{x:0,y:0,width:10,height:10,rx:10,ry:10,fill:"rgba(15,23,42,.92)"});
    const tipText1 = svgEl("text",{x:0,y:0,fill:"#ffffff","font-size":"11","font-weight":"700"});
    const tipText2 = svgEl("text",{x:0,y:0,fill:"#e2e8f0","font-size":"10"});
    const tipText3 = svgEl("text",{x:0,y:0,fill:"#e2e8f0","font-size":"10"});
    tipG.appendChild(tipRect);
    tipG.appendChild(tipText1);
    tipG.appendChild(tipText2);
    tipG.appendChild(tipText3);
    svg.appendChild(tipG);

    // helper to set tooltip size
    function setTipBox(lines){
      // rough measure: 7px per char; safe padding
      const maxLen = Math.max(...lines.map(s=>String(s).length));
      const w = Math.max(160, maxLen*7 + 24);
      const h = 68;
      tipRect.setAttribute("width", w);
      tipRect.setAttribute("height", h);
      return {w,h};
    }

    function showAt(idx){
      idx = clamp(idx,0,n-1);
      const x = xScale(idx);
      vLine.setAttribute("x1", x);
      vLine.setAttribute("x2", x);
      vLine.setAttribute("opacity", "1");

      const title = xLabels[idx];
      const l1 = `${title}`;
      // valores por línea
      const a = lines[0] ? lines[0].values[idx] : 0;
      const b = lines[1] ? lines[1].values[idx] : null;
      const l2 = lines[0] ? `${lines[0].name}: ${fmtMXN(a)}` : "";
      const l3 = (b!==null && lines[1]) ? `${lines[1].name}: ${fmtMXN(b)}` : "";

      const dims = setTipBox([l1,l2,l3]);

      // posicionar cerca del punto superior
      const yA = yScale(a);
      const yB = (b!==null) ? yScale(b) : yA;
      const y = Math.min(yA, yB);
      let tx = x + 12;
      let ty = y - dims.h/2;
      // clamp dentro del svg
      if(tx + dims.w > W - 8) tx = x - dims.w - 12;
      ty = clamp(ty, 8, H - dims.h - 8);

      tipRect.setAttribute("x", tx);
      tipRect.setAttribute("y", ty);

      tipText1.textContent = l1;
      tipText2.textContent = l2;
      tipText3.textContent = l3;

      tipText1.setAttribute("x", tx + 12);
      tipText1.setAttribute("y", ty + 22);
      tipText2.setAttribute("x", tx + 12);
      tipText2.setAttribute("y", ty + 42);
      tipText3.setAttribute("x", tx + 12);
      tipText3.setAttribute("y", ty + 58);

      tipG.setAttribute("opacity","1");
    }

    function hideTip(){
      tipG.setAttribute("opacity","0");
      vLine.setAttribute("opacity","0");
    }

    overlay.addEventListener("mousemove", (e)=>{
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const rel = (loc.x - x0) / (plotW || 1);
      const idx = Math.round(rel * (n-1));
      showAt(idx);
    });
    overlay.addEventListener("mouseleave", hideTip);
    overlay.addEventListener("touchstart", (e)=>{
      const t = e.touches[0];
      const pt = svg.createSVGPoint();
      pt.x = t.clientX; pt.y = t.clientY;
      const loc = pt.matrixTransform(svg.getScreenCTM().inverse());
      const rel = (loc.x - x0) / (plotW || 1);
      const idx = Math.round(rel * (n-1));
      showAt(idx);
    }, {passive:true});
    overlay.addEventListener("touchend", hideTip);

    svg.appendChild(overlay);

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


    // ---- interactividad: tooltip al pasar el cursor ----
    const overlay = svgEl("rect",{x:x0,y:y0,width:plotW,height:plotH,fill:"transparent"});
    overlay.style.cursor = "crosshair";

    const tipG = svgEl("g",{opacity:"0"});
    const tipRect = svgEl("rect",{x:0,y:0,width:220,height:44,fill:"#0f172a",rx:10,ry:10,opacity:"0.92"});
    const tipText1 = svgEl("text",{x:10,y:18,fill:"#ffffff","font-size":"11","font-weight":"700"});
    const tipText2 = svgEl("text",{x:10,y:34,fill:"#e2e8f0","font-size":"11"});
    tipG.appendChild(tipRect);
    tipG.appendChild(tipText1);
    tipG.appendChild(tipText2);
    svg.appendChild(tipG);

    function hideTip(){
      tipG.setAttribute("opacity","0");
    }

    function showTip(loc){
      const x = loc.x, y = loc.y;
      if (x < x0 || x > x0 + plotW || y < y0 || y > y0 + plotH){ hideTip(); return; }

      const rowIdx = clamp(Math.floor((y - y0) / (yStep || 1)), 0, rows.length - 1);
      const r = rows[rowIdx];

      const rel = clamp((x - x0) / (plotW || 1), 0, 1);

      // determinar segmento
      let acc = 0, segIdx = 0, segVal = 0;
      for (let j=0; j<r.parts.length; j++){
        const p = clamp(r.parts[j],0,1);
        acc += p;
        if (rel <= acc + 1e-9){
          segIdx = j;
          segVal = p;
          break;
        }
      }

      tipText1.textContent = r.label;
      tipText2.textContent = `${partNames[segIdx]}: ${Math.round(segVal*100)}%`;

      // posicionar tooltip (evitar salir del canvas)
      const tx = clamp(x + 12, 8, W - 228);
      const ty = clamp(y - 50, 8, H - 54);
      tipG.setAttribute("transform", `translate(${tx},${ty})`);
      tipG.setAttribute("opacity","1");
    }

    function svgPointFromEvent(e){
      const pt = svg.createSVGPoint();
      pt.x = (e.touches ? e.touches[0].clientX : e.clientX);
      pt.y = (e.touches ? e.touches[0].clientY : e.clientY);
      return pt.matrixTransform(svg.getScreenCTM().inverse());
    }

    overlay.addEventListener("mousemove", (e)=> showTip(svgPointFromEvent(e)));
    overlay.addEventListener("mouseleave", hideTip);
    overlay.addEventListener("touchstart", (e)=> showTip(svgPointFromEvent(e)), {passive:true});
    overlay.addEventListener("touchmove", (e)=> showTip(svgPointFromEvent(e)), {passive:true});
    overlay.addEventListener("touchend", hideTip);

    svg.appendChild(overlay);

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
    const header = ["Año","Ventas","UtilidadBruta","MargenBruto","GastoOperativo","UtilidadOperativa","EBITDA","MargenEBITDA","MargenOperativo"];
    const lines = [
      header.join(","),
      ...rows.map(r=>[
        r.year,
        r.sales.toFixed(0),
        r.grossProfit.toFixed(0),
        (r.grossMargin*100).toFixed(2)+"%",
        r.opex.toFixed(0),
        r.opProfit.toFixed(0),
        r.ebitda.toFixed(0),
        (r.ebitdaMargin*100).toFixed(2)+"%",
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

  
  // ---------- formato de inputs (12,000,000.00) ----------
  function attachMoneyFormatters(){
    const inputs = Array.from(document.querySelectorAll('input[data-money="1"]'));
    inputs.forEach(inp => {
      const fmt = () => {
        const raw = (inp.value||"").trim();
        if(!raw) return;
        const n = parseNum(raw, 0);
        inp.value = fmtMoney(n);
      };
      inp.addEventListener("blur", fmt);
      fmt();
    });
  }
// ---------- inversión UI ----------
  function renderInvestmentCalc(rows){
    const invEl = document.getElementById("invAmount");
    const fcfEl = document.getElementById("fcfConv");
    const discEl = document.getElementById("discRate");
    const gEl = document.getElementById("gAfter");
    const extraEl = document.getElementById("extraYears");
    if(!invEl || !fcfEl || !discEl || !gEl || !extraEl) return; // si no existe en el DOM

    const investment = Math.max(0, parseNum(invEl.value, 0));
    const fcfConv = parseFloat(fcfEl.value);
    const discRate = parseFloat(discEl.value);
    const gAfter = parseFloat(gEl.value);
    const extraYears = parseInt(extraEl.value, 10);

    document.getElementById("fcfConvVal").textContent = Math.round(fcfConv*100) + "%";
    document.getElementById("discRateVal").textContent = Math.round(discRate*100) + "%";
    document.getElementById("gAfterVal").textContent = Math.round(gAfter*100) + "%";
    document.getElementById("extraYearsVal").textContent = String(extraYears);

    const fcfSeries = computeExtendedFCF(rows, fcfConv, extraYears, gAfter);

    const pbSimple = findPaybackMonthly(fcfSeries, investment, discRate, false);
    const pbDisc = findPaybackMonthly(fcfSeries, investment, discRate, true);

    const pbSimpleTxt = pbSimple ? `${MONTHS_ES[pbSimple.month]} ${pbSimple.year}` : "No recupera en el horizonte";
    const pbDiscTxt = pbDisc ? `${MONTHS_ES[pbDisc.month]} ${pbDisc.year}` : "No recupera en el horizonte";
    document.getElementById("pbSimple").textContent = pbSimpleTxt;
    document.getElementById("pbDisc").textContent = pbDiscTxt;

    // mostrar meses/años desde inicio 2026 (t=0)
    const pbToMonths = (pb)=> pb ? ((pb.year-2026)*12 + pb.month + 1) : null;
    const ms = pbToMonths(pbSimple);
    const md = pbToMonths(pbDisc);
    const fmtYears = (m)=> (m/12).toFixed(1);
    const elPS = document.getElementById("pbSimpleYears");
    const elPD = document.getElementById("pbDiscYears");
    if(elPS) elPS.textContent = ms ? `${ms} meses (${fmtYears(ms)} años)` : "";
    if(elPD) elPD.textContent = md ? `${md} meses (${fmtYears(md)} años)` : "";


    const npv = npvMonthly(fcfSeries, investment, discRate);
    const irr = irrAnnual(fcfSeries.slice(0, Math.min(fcfSeries.length, 12)), investment); // limitar para estabilidad
    const irrTxt = (irr === null) ? "—" : (new Intl.NumberFormat("es-MX",{style:"percent",maximumFractionDigits:1}).format(irr));
    document.getElementById("npvIrr").innerHTML = `${fmtMXN(npv)} <span class="small">NPV</span> · ${irrTxt} <span class="small">IRR</span>`;

    const cumS = cumByYearSimple(fcfSeries, investment);
    const cumD = cumByYearDiscounted(fcfSeries, investment, discRate);

    renderLineChart(
      "chart_payback",
      cumS.labels,
      [
        { name:"Acumulado (simple)", values:cumS.values, color:"rgba(14,165,233,.85)" },
        { name:"Acumulado (descontado)", values:cumD.values, color:"rgba(245,158,11,.80)" }
      ],
      { aria:"Flujo acumulado", yTick:(v)=> (v/1e6).toFixed(0)+"M" }
    );
  }
  // ---------- sedes UI ----------
  function renderSitesCalc(){
    const scEl = document.getElementById("siteCount");
    const capEl = document.getElementById("capexPerSite");
    const wcEl  = document.getElementById("wcPerSite");
    const sEl   = document.getElementById("salesPerSiteM");
    const gmEl  = document.getElementById("gmSite");
    const oEl   = document.getElementById("opexPerSiteM");
    const cEl   = document.getElementById("corpOpexM");
    const daEl  = document.getElementById("daPctSite");
    if(!scEl || !capEl || !wcEl || !sEl || !gmEl || !oEl || !cEl || !daEl) return;

    // Auto-llenado de escenario ideal según # de sedes
    const autoEl = document.getElementById("sitesAuto");
    const autoOn = autoEl ? !!autoEl.checked : false;
    // Persistimos el último # de sedes aplicado para no sobreescribir mientras editas
    window.__SANARE_SITES_LAST_APPLIED = window.__SANARE_SITES_LAST_APPLIED ?? null;

    const nRaw = Math.max(1, parseInt(scEl.value || "1", 10));
    if(autoOn && window.__SANARE_SITES_LAST_APPLIED !== nRaw){
      const p = pickSitePreset(nRaw);
      capEl.value = fmtMoney(p.capex);
      wcEl.value  = fmtMoney(p.wc);
      sEl.value   = fmtMoney(p.salesPerSiteM);
      gmEl.value  = String(p.gm);
      oEl.value   = fmtMoney(p.opexPerSiteM);
      cEl.value   = fmtMoney(p.corpOpexM);
      daEl.value  = String(p.daPct);

      const gEl2a = document.getElementById("sitesGrowth");
      const yearsEl2a = document.getElementById("sitesYears");
      if(gEl2a) gEl2a.value = String(p.growth);
      if(yearsEl2a) yearsEl2a.value = String(p.years);

      // formatea inputs monetarios recién seteados
      attachMoneyFormatters();
      window.__SANARE_SITES_LAST_APPLIED = nRaw;
    }

    const n = nRaw;
    const capex = Math.max(0, parseNum(capEl.value, 0));
    const wc = Math.max(0, parseNum(wcEl.value, 0));
    const salesPerSiteM = Math.max(0, parseNum(sEl.value, 0));
    const gm = Math.min(0.95, Math.max(0.01, parseFloat(gmEl.value || "0.35")));
    const opexPerSiteM = Math.max(0, parseNum(oEl.value, 0));
    const corpOpexM = Math.max(0, parseNum(cEl.value, 0));
    const daPct = Math.min(0.20, Math.max(0.0, parseFloat(daEl.value || "0.0")));

    const gEl2 = document.getElementById("sitesGrowth");
    const yearsEl2 = document.getElementById("sitesYears");
    const growth = gEl2 ? clamp(parseFloat(gEl2.value || "0.10"), 0, 0.30) : 0.10;
    const yearsToProject = yearsEl2 ? Math.max(3, parseInt(yearsEl2.value || "5", 10)) : 5;
    const gVal2 = document.getElementById("sitesGrowthVal");
    if(gVal2) gVal2.textContent = Math.round(growth*100) + "%";


    const gmVal = document.getElementById("gmSiteVal");
    if(gmVal) gmVal.textContent = Math.round(gm*100) + "%";
    const daVal = document.getElementById("daPctSiteVal");
    if(daVal) daVal.textContent = (daPct*100).toFixed(1) + "%";

    const investment = n * (capex + wc);

    const salesM = n * salesPerSiteM;
    const salesY = salesM * 12;

    const grossProfitM = salesM * gm;
    const opexM = n * opexPerSiteM + corpOpexM;

    const ebitdaM = grossProfitM - opexM;
    const ebitdaY = ebitdaM * 12;

    const daM = (salesY * daPct) / 12; // D&A mensual aprox
    const ebitM = ebitdaM - daM;

    const fcfEl = document.getElementById("fcfConv");
    const fcfConv = fcfEl ? parseFloat(fcfEl.value || "0.7") : 0.7;
    const fcfM = ebitM * fcfConv;
    const fcfY = fcfM * 12;

    // break-even por sede (EBITDA≈0)
    const reqSalesTotalM = (gm > 0) ? (opexM / gm) : Infinity;
    const reqSalesPerSiteM = reqSalesTotalM / n;

    // payback (simulación mensual con crecimiento)
    const pbEl = document.getElementById("sitesPayback");
    const pbMetaEl = document.getElementById("sitesPaybackMeta");
    const toMonthYear = (mm)=>{
      const m0 = Math.max(0, Math.ceil(mm)-1);
      const year = 2026 + Math.floor(m0/12);
      const month = m0 % 12;
      return {year, month};
    };

    let paybackMonth = null;
    let acc = -investment;
    const monthsSim = yearsToProject * 12;
    const fcfMonthlySeries = [];
    for(let m=0; m<monthsSim; m++){
      const yi = Math.floor(m/12);
      const salesPerSiteM_m = salesPerSiteM * Math.pow(1+growth, yi);
      const salesM_m = n * salesPerSiteM_m;
      const grossProfitM_m = salesM_m * gm;
      const opexM_m = n * opexPerSiteM + corpOpexM;
      const ebitdaM_m = grossProfitM_m - opexM_m;
      const daM_m = salesM_m * daPct;
      const ebitM_m = ebitdaM_m - daM_m;
      const fcfM_m = ebitM_m * fcfConv;
      fcfMonthlySeries.push(fcfM_m);
      acc += fcfM_m;
      if(paybackMonth === null && acc >= 0) paybackMonth = m+1;
    }

    if(paybackMonth === null){
      if(pbEl) pbEl.textContent = "No recupera";
      if(pbMetaEl) pbMetaEl.textContent = "En el horizonte simulado";
    } else {
      const d = toMonthYear(paybackMonth);
      if(pbEl) pbEl.textContent = `${MONTHS_ES[d.month]} ${d.year}`;
      if(pbMetaEl) pbMetaEl.textContent = `${paybackMonth} meses (${(paybackMonth/12).toFixed(1)} años)`;
    }

    // Proyección anual
    const projBody = document.getElementById("sitesProjBody");
    if(projBody) projBody.innerHTML = "";
    const years = [];
    const accArr = [];
    let accY = -investment;
    for(let i=0; i<yearsToProject; i++){
      const year = 2026 + i;
      const salesPerSiteM_y = salesPerSiteM * Math.pow(1+growth, i);
      const salesY = n * salesPerSiteM_y * 12;
      const grossProfitY = salesY * gm;
      const opexY = (n * opexPerSiteM + corpOpexM) * 12;
      const ebitdaY = grossProfitY - opexY;
      const daY = salesY * daPct;
      const ebitY = ebitdaY - daY;
      const fcfY = ebitY * fcfConv;
      accY += fcfY;
      years.push(String(year));
      accArr.push(accY);

      if(projBody){
        const tr = document.createElement("tr");
        const td = (txt, cls)=>{ const x=document.createElement("td"); x.textContent=txt; if(cls) x.className=cls; return x; };
        tr.appendChild(td(String(year), ""));
        tr.appendChild(td(fmtMXN(salesY), "num"));
        tr.appendChild(td(fmtMXN(ebitdaY), "num"));
        tr.appendChild(td(fmtMXN(fcfY), "num"));
        tr.appendChild(td(fmtMXN(accY), "num"));
        if(accY >= 0) tr.style.background = "rgba(16,185,129,.08)";
        projBody.appendChild(tr);
      }
    }

    renderLineChart("chart_sites_proj", years, [
      {name:"Acumulado FCF", values: accArr, color:"rgba(59,130,246,.85)"},
    ], { aria:"Sedes: acumulado de flujo", yTick:(v)=> (v/1e6).toFixed(0)+"M" });
const setTxt = (id, val, fallback="—")=>{
      const el = document.getElementById(id);
      if(!el) return;
      el.textContent = (val === null || !isFinite(val)) ? fallback : val;
    };

    setTxt("sitesInv", fmtMXN(investment));
    setTxt("sitesSalesY", fmtMXN(salesY));
    setTxt("sitesEbitdaY", fmtMXN(ebitdaY));
    setTxt("sitesFcfM", fmtMXN(fcfM));
    setTxt("sitesReqSales", fmtMXN(reqSalesPerSiteM));

    renderBarChart("chart_sites",
      [
        {label:"Ventas", value:salesY},
        {label:"EBITDA", value:ebitdaY},
        {label:"FCF (aprox)", value:fcfY}
      ],
      { aria:"Sedes: ventas, EBITDA y flujo", yTick:(v)=> (v/1e6).toFixed(0)+"M" }
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
        <td class="num">${fmtMXN(r.ebitda)}</td>
        <td class="num">${fmtPct(r.ebitdaMargin)}</td>
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
    

    renderBarChart("chart_ebitda",
      rows.map(r=>({label:String(r.year), value:r.ebitda})),
      { aria:"EBITDA por año", yTick:(v)=> (v/1e6).toFixed(0)+"M", valueLabel:(v)=> (v/1e6).toFixed(0)+"M" }
    );

    renderLineChart("chart_margins",
      rows.map(r=>String(r.year)),
      [
        { name:"Margen bruto", values: rows.map(r=>r.grossMargin*100), color:"rgba(14,165,233,.85)" },
        { name:"Margen EBITDA", values: rows.map(r=>r.ebitdaMargin*100), color:"rgba(34,197,94,.80)" },
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

    // inversión / payback
    renderInvestmentCalc(rows);

    // calculadora de sedes
    renderSitesCalc();

    // bind buttons
    document.getElementById("btnCSV").onclick = () => exportCSV(rows, salesFactor, mktPct);
    document.getElementById("btnCSV2").onclick = () => exportCSV(rows, salesFactor, mktPct);
  }

  function init(){
    attachMoneyFormatters();
    document.getElementById("today").textContent = new Date().toLocaleDateString("es-MX",{year:"numeric",month:"long",day:"numeric"});
    initTabs();
    mountQuestions();

    document.getElementById("salesFactor").addEventListener("input", render);
    document.getElementById("mktPct").addEventListener("input", render);

    // inversión / payback
    const reRenderIds = ["invAmount","fcfConv","discRate","gAfter","extraYears","siteCount","sitesAuto","sitesGrowth","sitesYears","capexPerSite","wcPerSite","salesPerSiteM","gmSite","opexPerSiteM","corpOpexM","daPctSite"];
    reRenderIds.forEach(id => {
      const el = document.getElementById(id);
      if(!el) return;
      el.addEventListener("input", render);
      el.addEventListener("change", render);
    });

    const autoEl = document.getElementById("sitesAuto");
    if(autoEl){
      autoEl.addEventListener("change", ()=>{ window.__SANARE_SITES_LAST_APPLIED = null; render(); });
    }

    document.getElementById("btnPrint").addEventListener("click", ()=> window.print());

    // defaults sedes
    if (D.sitesDefaults){
      const setIf = (id, v)=>{
        const el = document.getElementById(id);
        if(!el) return;
        if(el.value === "" || el.value === null || typeof el.value === "undefined") el.value = v;
        else el.value = v; // for consistencia en demos
      };
      setIf("siteCount", D.sitesDefaults.siteCount);
      setIf("capexPerSite", D.sitesDefaults.capexPerSite);
      setIf("wcPerSite", D.sitesDefaults.wcPerSite);
      setIf("salesPerSiteM", D.sitesDefaults.salesPerSiteM);
      setIf("gmSite", D.sitesDefaults.grossMargin);
      setIf("opexPerSiteM", D.sitesDefaults.opexPerSiteM);
      setIf("corpOpexM", D.sitesDefaults.corpOpexM);
      setIf("daPctSite", D.sitesDefaults.daPct);
    }

    document.getElementById("btnChecklist").addEventListener("click", exportChecklist);

    render();

    window.addEventListener("resize", () => {
      clearTimeout(window.__rz);
      window.__rz = setTimeout(render, 120);
    });
  }

  document.addEventListener("DOMContentLoaded", init);
})();