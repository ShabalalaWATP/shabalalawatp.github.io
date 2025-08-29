// Alex Money Plan — Buffer-first avalanche forecaster
// Vanilla JS, no external libs. UK currency formatting.

(function(){
  const GBP = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP', maximumFractionDigits: 2 });

  // Configuration constants
  const MONTHS = 18;
  const START_YEAR = 2025;
  const START_MONTH_INDEX = 8; // 0-based: 8 = September
  const BUFFER_GOAL = 3500;
  const STARTING_BALANCE = 1250; // 1 Sep 2025

  // Fixed non-debt costs
  const NON_DEBT_FIXED = {
    fuel: 100,
    rent: 68,
    household: 50,
    haircuts: 60,
    surprise: 100 // surprise pot +£20
  };

  // Subscriptions & services (itemised)
  const SUBS_ITEMS = [
    { name:'Amazon Prime', amount:8.99 },
    { name:'Netflix', amount:18.99 },
    { name:'Microsoft', amount:10.49 },
    { name:'GitHub', amount:29.13 },
    { name:'ChatGPT Plus', amount:17.99 },
    { name:'H3G Device', amount:29.61 },
    { name:'H3G (mobile)', amount:55.80 },
    { name:'Vision Express Contact Lenses', amount:38.00 },
    { name:'Prime Video', amount:7.99 },
    { name:'Prime Video (addon)', amount:0.99 },
    { name:'YouTube Premium', amount:16.99 },
    { name:'iCloud+', amount:2.99 },
    { name:'Apple One', amount:18.95 },
    { name:'Kit Insurance', amount:12.74 },
    { name:'HP Ink', amount:1.79 }
  ];

  function subsTotalForMonth(/* m */){
    // All subs are monthly recurring for this window, so sum static list
    return SUBS_ITEMS.reduce((s,it)=> s + it.amount, 0);
  }

  // Car maintenance: one-off months; Oct +£150 extra total vs base £200
  function carMaintenanceForMonth(m){
    if(m===1) return 350; // October
    if(m===4 || m===7) return 200; // Jan, Apr
    return 0;
  }

  // Road tax: £20 in January only (Jan 2026 m=4)
  function roadTaxForMonth(m){
    return (m===4) ? 20 : 0;
  }

  // Debts initial
  const DEFAULT_DEBTS = [
    { key:'d118', name:'118 Loan', balance:1800.75, min:120.05 },
    { key:'card', name:'Credit Card', balance:2739.21, min:94.49 },
    { key:'up', name:'Updraft', balance:2433.06, min:52.63 }
  ];

  // Special income schedule defaults (no special outgoings; those are added as one-off fixed outgoings)
  function defaultSpecials(){
    const arr = Array.from({length:MONTHS}, () => ({
      spendItems: [],
      incomeItems: [],
      spendAdj: 0,
      incomeAdj: 0
    }));
    // Clothing allowance in October as special income
    arr[1].incomeItems.push({ desc:'Clothing allowance', amount:600 });
    return arr;
  }

  // Treat cadence: every other month starting Oct 2025 => toggle preset true for m=1,3,5,...
  function defaultTreats(){
    const arr = Array.from({length:MONTHS}, (_,m) => (m % 2 === 1));
    return arr;
  }

  // Default income: baseline £3,100/month; clothing allowance as Special Income in Oct.
  // September shows £0 income (paid end of August), start balance already reflects that.
  function defaultIncome(){
    const arr = Array.from({length:MONTHS}, () => 3100);
    arr[0] = 0; // Sep
    return arr;
  }


  // Local storage helpers (versioned)
  const LS_KEY = 'alex-money-plan-v2';
  const VERSION = 4;
  function loadState(){
    try{
      const raw = localStorage.getItem(LS_KEY);
      if(!raw) return null;
      return normalizeState(JSON.parse(raw));
    }catch{ return null; }
  }
  function saveState(){
    localStorage.setItem(LS_KEY, JSON.stringify(state));
  }

  // Normalize legacy state to current specials format and migrate values
  function normalizeState(s){
    if(!s) return null;
    if(s.version === VERSION) return s;
    const t = { ...s };
    // Specials might be array of {spend, income}
    if(Array.isArray(t.specials) && t.specials.length===MONTHS && (t.specials[0].spend !== undefined || t.specials[0].spendItems === undefined)){
      const converted = Array.from({length:MONTHS}, (_,m)=>{
        const old = t.specials[m] || { spend:0, income:0 };
        return {
          spendItems: [],
          incomeItems: [],
          spendAdj: parseNum(old.spend||0),
          incomeAdj: parseNum(old.income||0)
        };
      });
      t.specials = converted;
    }
    // Migrate Oct £600 uplift from Income to Special income if needed
    try{
      if(Array.isArray(t.income) && t.income.length>=2){
        const base = 3100;
        const octIncome = parseNum(t.income[1]);
        const uplift = Math.round((octIncome - base) * 100) / 100;
        const hasClothing = Array.isArray(t.specials?.[1]?.incomeItems) && t.specials[1].incomeItems.some(it => /clothing/i.test(String(it.desc||'')));
        if(uplift >= 600 && !hasClothing){
          t.income[1] = round2(octIncome - 600);
          if(!t.specials) t.specials = defaultSpecials();
          if(!t.specials[1]) t.specials[1] = { spendItems:[], incomeItems:[], spendAdj:0, incomeAdj:0 };
          t.specials[1].incomeItems = t.specials[1].incomeItems || [];
          t.specials[1].incomeItems.push({ desc:'Clothing allowance', amount:600 });
        }
      }
    }catch{}

    // Ensure September income is £0 (paid end of August, start balance reflects funds)
    try{
      if(Array.isArray(t.income) && t.income.length>0){
        // Only adjust if September looks like baseline income
        if(parseNum(t.income[0]) > 0){ t.income[0] = 0; }
      }
    }catch{}

    t.version = VERSION;
    return t;
  }

  // State
  let state = loadState() || {
    income: defaultIncome(),
    specials: defaultSpecials(),
    treats: defaultTreats(),
    weeklyFood: 50,
    treatUplift: 150,
    extraPlanned: 900,
    includeMinimums: true,
    debts: DEFAULT_DEBTS.map(d=>({...d})),
    liveBalance: STARTING_BALANCE,
    version: VERSION,
    compactRows: false
  };

  // Ensure newly requested default items exist in saved plans without overwriting edits
  function ensureExtras(){
    try{
      if(!state.specials || !Array.isArray(state.specials)) return;
      // October (m=1)
      state.specials[1] = state.specials[1] || { spendItems:[], incomeItems:[], spendAdj:0, incomeAdj:0 };
      const oct = state.specials[1];
      oct.spendItems = oct.spendItems || [];
      if(!oct.spendItems.some(it=>/wedding\s*suit/i.test(String(it.desc||'')))){
        oct.spendItems.push({ desc:'Wedding suit', amount:150 });
      }
      if(!oct.spendItems.some(it=>/extra\s*car\s*fee/i.test(String(it.desc||'')))){
        oct.spendItems.push({ desc:'Extra car fees', amount:100 });
      }
      // November (m=2)
      state.specials[2] = state.specials[2] || { spendItems:[], incomeItems:[], spendAdj:0, incomeAdj:0 };
      const nov = state.specials[2];
      nov.spendItems = nov.spendItems || [];
      if(!nov.spendItems.some(it=>/airbnb/i.test(String(it.desc||'')))){
        nov.spendItems.push({ desc:'Airbnb fees (holiday)', amount:150 });
      }
      // Remove legacy Extra fuel special (now part of fixed fuel for Dec)
      state.specials[3] = state.specials[3] || { spendItems:[], incomeItems:[], spendAdj:0, incomeAdj:0 };
      const dec = state.specials[3];
      dec.spendItems = (dec.spendItems || []).filter(it=>!/extra\s*fuel/i.test(String(it.desc||'')));
    }catch{}
  }

  // Convert known reimbursements (if present) into net extra spend in prior month
  (function applyReimbursementNetting(){
    try{
      const sep = state.specials[0];
      const oct = state.specials[1];
      if(oct && Array.isArray(oct.incomeItems)){
        const idx = oct.incomeItems.findIndex(it=>/reimb/i.test(String(it.desc||'')) && /london/i.test(String(it.desc||'')));
        if(idx>=0){
          const reimb = parseNum(oct.incomeItems[idx].amount);
          if(sep){
            let spendIdx = (sep.spendItems||[]).findIndex(it=>/london/i.test(String(it.desc||'')));
            if(spendIdx<0){ sep.spendItems = sep.spendItems||[]; sep.spendItems.push({desc:'London trip extra', amount: Math.max(0,reimb)}); }
            else{
              const orig = parseNum(sep.spendItems[spendIdx].amount);
              const net = Math.max(0, round2(orig - reimb));
              sep.spendItems[spendIdx].amount = net;
              sep.spendItems[spendIdx].desc = 'London trip extra';
            }
          }
          oct.incomeItems.splice(idx,1);
        }
      }
      const nov = state.specials[2];
      const dec = state.specials[3];
      if(dec && Array.isArray(dec.incomeItems)){
        const idx = dec.incomeItems.findIndex(it=>/reimb/i.test(String(it.desc||'')) && /tokyo/i.test(String(it.desc||'')));
        if(idx>=0){
          const reimb = parseNum(dec.incomeItems[idx].amount);
          if(nov){
            let spendIdx = (nov.spendItems||[]).findIndex(it=>/tokyo/i.test(String(it.desc||'')));
            if(spendIdx<0){ nov.spendItems = nov.spendItems||[]; nov.spendItems.push({desc:'Tokyo trip extra', amount: Math.max(0,reimb)}); }
            else{
              const orig = parseNum(nov.spendItems[spendIdx].amount);
              const net = Math.max(0, round2(orig - reimb));
              nov.spendItems[spendIdx].amount = net;
              nov.spendItems[spendIdx].desc = 'Tokyo trip extra';
            }
          }
          dec.incomeItems.splice(idx,1);
        }
      }
    }catch{}
  })();

  // Extra fixed items helpers
  function extraFuelForMonth(m){
    // December only (m=3): +£50
    return (m===3) ? 50 : 0;
  }

  function oneOffOutgoings(m){
    const items = [];
    // Sep 2025 m=0
    if(m===0) items.push({ name:'Travel (London) extra', amount:100 });
    // Oct 2025 m=1
    if(m===1) { items.push({ name:'Wedding suit', amount:150 }); items.push({ name:'Extra car fees', amount:100 }); }
    // Nov 2025 m=2
    if(m===2) { items.push({ name:'Travel (Tokyo) extra', amount:300 }); items.push({ name:'Airbnb fees (holiday)', amount:150 }); }
    // Gifts / Events across 2026
    if(m===5) items.push({ name:"Valentine's Day", amount:80 });
    if(m===6) items.push({ name:"Mother's Day (UK)", amount:40 });
    if(m===7) { items.push({ name:'Cousin April', amount:60 }); items.push({ name:'Stephen', amount:40 }); }
    if(m===8) items.push({ name:"Honor's birthday", amount:150 });
    if(m===9) { items.push({ name:'Mum', amount:50 }); items.push({ name:"Father's Day (UK)", amount:40 }); }
    if(m===11) items.push({ name:'Aunt Lyn', amount:40 });
    if(m===13) items.push({ name:"Dad's partner Jan", amount:40 });
    if(m===15) { items.push({ name:'Dad', amount:50 }); items.push({ name:'Christmas', amount:250 }); }
    const total = items.reduce((s,it)=> s + it.amount, 0);
    return { items, total };
  }

  function specialSums(m){
    const sp = state.specials[m] || { spendItems:[], incomeItems:[], spendAdj:0, incomeAdj:0 };
    const spendBase = (sp.spendItems||[]).reduce((s,it)=> s + parseNum(it.amount), 0);
    const incomeBase = (sp.incomeItems||[]).reduce((s,it)=> s + parseNum(it.amount), 0);
    const spendAdj = parseNum(sp.spendAdj||0);
    const incomeAdj = parseNum(sp.incomeAdj||0);
    const spendTotal = round2(spendBase + spendAdj);
    const incomeTotal = round2(incomeBase + incomeAdj);
    return { spendBase, incomeBase, spendAdj, incomeAdj, spendTotal, incomeTotal, sp };
  }

  // Utility: month label
  function monthLabel(mIndex){
    const date = new Date(START_YEAR, START_MONTH_INDEX + mIndex, 1);
    return date.toLocaleString('en-GB', { month:'short', year:'numeric' });
  }

  // Core calculation engine
  function compute(){
    // Work on fresh balances per forecast (do not mutate persisted principal until end)
    const debts = state.debts.map(d=>({ ...d }));
    const results = [];
    const weeklyFood = parseNum(state.weeklyFood);
    const treatUplift = parseNum(state.treatUplift);
    const extraPlanned = parseNum(state.extraPlanned);

    let currentEndPrev = STARTING_BALANCE; // CurrentAccountEnd(-1)
    let externalSavingsTotal = 0; // Separate savings account (swept above buffer)
    let bufferReachedMonth = null;
    let focusThisMonth = '';
    let peakCash = 0; let totalCashNeeded = 0;

    for(let m=0;m<MONTHS;m++){
      const income = parseNum(state.income[m]);
      const treat = !!state.treats[m];
      const foodFun = weeklyFood * 4.33 + (treat ? treatUplift : 0);

      // Capture start-of-month balances before any payments
      const startBalances = {
        d118: debts.find(d=>d.key==='d118').balance,
        card: debts.find(d=>d.key==='card').balance,
        up: debts.find(d=>d.key==='up').balance
      };
      const ss = specialSums(m);
      const specialIncome = ss.incomeTotal;
      const currentStart = round2(currentEndPrev + income + specialIncome); // start balance after pay hits

      // Active minimums at start-of-month
      const activeMins = Object.values(startBalances).reduce((s,b,idx)=>{
        const d = state.debts[idx];
        return s + (b>0 ? d.min : 0);
      }, 0);

      const nonDebtFixed = subsTotalForMonth() + (NON_DEBT_FIXED.fuel + extraFuelForMonth(m)) + NON_DEBT_FIXED.rent + NON_DEBT_FIXED.household + NON_DEBT_FIXED.haircuts + NON_DEBT_FIXED.surprise + carMaintenanceForMonth(m) + roadTaxForMonth(m) + oneOffOutgoings(m).total;
      const fixed = nonDebtFixed + activeMins;

      const specialSpend = 0; // all outgoings are within fixed/one-offs now
      const cashNeededBase = fixed + foodFun; // special income already included in currentStart

      // Buffer logic: until end of first month where CurrentAccountEnd >= BUFFER_GOAL, ExtraApplied = 0
      let extraApplied = 0;
      let bufferModeOn = currentEndPrev < BUFFER_GOAL;
      if(!bufferModeOn){
        // Maintain floor at BUFFER_GOAL for end-of-month
        const maxExtraToKeepFloor = Math.max(0, currentStart - cashNeededBase - BUFFER_GOAL);
        extraApplied = Math.min(extraPlanned, maxExtraToKeepFloor);
      }

      // Pay minimums if configured to reduce balances
      let minsPaid118=0, minsPaidCC=0, minsPaidUp=0;
      if(state.includeMinimums){
        for(const d of debts){
          if(d.balance > 0){
            const pay = Math.min(d.balance, d.min);
            if(d.key==='d118') minsPaid118 = pay;
            if(d.key==='card') minsPaidCC = pay;
            if(d.key==='up') minsPaidUp = pay;
            d.balance = round2(d.balance - pay);
          }
        }
      }

      // Apply extra by avalanche order: 118 -> Card -> Updraft
      let extra118=0, extraCC=0, extraUp=0;
      let remainingExtra = extraApplied;
      const order = ['d118','card','up'];
      for(const key of order){
        const d = debts.find(x=>x.key===key);
        if(!d || remainingExtra<=0) continue;
        if(d.balance<=0) continue;
        const pay = Math.min(remainingExtra, d.balance);
        d.balance = round2(d.balance - pay);
        remainingExtra = round2(remainingExtra - pay);
        if(key==='d118') extra118 += pay;
        if(key==='card') extraCC += pay;
        if(key==='up') extraUp += pay;
      }

      // Compute totals and end balance
      const extraToShow = extraApplied; // applied towards debt or kept as 0 during buffer
      const cashNeeded = cashNeededBase + extraToShow;
      const savingsLeft = round2((income + specialIncome) - cashNeeded); // not shown in table
      let currentEnd = round2(currentStart - cashNeeded);

      // Sweep anything above the buffer into separate savings so buffer never exceeds goal
      let sweptToSavings = 0;
      if(currentEnd > BUFFER_GOAL){
        sweptToSavings = round2(currentEnd - BUFFER_GOAL);
        currentEnd = BUFFER_GOAL;
        externalSavingsTotal = round2(externalSavingsTotal + sweptToSavings);
      }

      // Track first month buffer is reached by end-of-month balance
      if(bufferReachedMonth===null && currentEnd >= BUFFER_GOAL){
        bufferReachedMonth = m;
      }

      // Track peak and average cash need
      totalCashNeeded += cashNeeded;
      if(cashNeeded > peakCash) peakCash = cashNeeded;

      // Focus this month (which debt received extra)
      focusThisMonth = extra118>0 ? '118 Loan' : (extraCC>0 ? 'Credit Card' : (extraUp>0 ? 'Updraft' : (bufferModeOn ? 'Buffer build' : 'Saving')));

      results.push({
        m,
        income, fixed, foodFun,
        specialNet: specialIncome - specialSpend,
        specialSpend, specialIncome,
        extraApplied: extraToShow,
        totalOutflow: cashNeeded,
        savingsLeft,
        focus: focusThisMonth,
        startBalances: { ...startBalances },
        currentStart,
        balances: {
          d118: debts.find(d=>d.key==='d118').balance,
          card: debts.find(d=>d.key==='card').balance,
          up: debts.find(d=>d.key==='up').balance
        },
        bufferModeOn,
        currentEnd,
        sweptToSavings,
        externalSavingsTotal
      });

      currentEndPrev = currentEnd;
    }

    // Debt-free date
    let debtFreeIndex = results.findIndex(r => r.balances.d118<=0 && r.balances.card<=0 && r.balances.up<=0);
    const debtFreeBy = debtFreeIndex>=0 ? monthLabel(debtFreeIndex) : 'Beyond period';
    const endSavings = results[results.length-1].externalSavingsTotal;
    const avgCash = totalCashNeeded / MONTHS;

    return { results, debtFreeBy, endSavings, avgCash, peakCash, bufferReachedMonth };
  }

  // Rendering
  let fixedMonthIndex = 0; // UI selection for fixed breakdown
  let bufferMonthIndex = 0; // UI selection for buffer view
  let debtMonthIndex = 0; // UI selection for debt progress

  function render(){
    const { results, debtFreeBy, endSavings, avgCash, peakCash } = compute();
    // Compact table rows toggle
    try{ document.body.classList.toggle('compact', !!state.compactRows); }catch{}

    // Buffer widget (start/end-of-month for selected month + live manual slider)
    ensureBufferMonthSelect(results);
    const br = results[Math.max(0, Math.min(MONTHS-1, bufferMonthIndex))];
    const startBal = br.currentStart;
    const endBal = br.currentEnd;
    const bufferOn = br.bufferModeOn;
    const startPct = Math.max(0, Math.min(1, startBal / BUFFER_GOAL)) * 100;
    const endPct = Math.max(0, Math.min(1, endBal / BUFFER_GOAL)) * 100;
    const startBalanceEl = $('#start-balance');
    if(startBalanceEl) startBalanceEl.textContent = GBP.format(startBal);
    const endBalanceEl = $('#end-balance');
    if(endBalanceEl) endBalanceEl.textContent = GBP.format(endBal);
    const startProg = $('#start-progress');
    if(startProg) startProg.style.width = startPct.toFixed(2) + '%';
    const endProg = $('#end-progress');
    if(endProg) endProg.style.width = endPct.toFixed(2) + '%';
    const modeEl = $('#buffer-mode');
    if(modeEl){ modeEl.textContent = bufferOn ? 'ON' : 'OFF'; modeEl.classList.toggle('tag-on', bufferOn); }

    // Savings above buffer (Buffer month): cumulative swept savings total
    const savTotal = br.externalSavingsTotal || 0;
    const savMax = Math.max(1, ...results.map(x => x.externalSavingsTotal || 0));
    const savPct = Math.max(0, Math.min(1, savTotal / savMax)) * 100;
    const barSavPost = $('#bar-savings-post');
    if(barSavPost) barSavPost.style.width = savPct.toFixed(2) + '%';
    const savPostAmt = $('#savings-post-amount');
    if(savPostAmt) savPostAmt.textContent = GBP.format(savTotal);

    const liveSlider = $('#live-balance');
    if(liveSlider && !liveSlider.dataset.bound){
      liveSlider.addEventListener('input', ()=>{
        state.liveBalance = parseNum(liveSlider.value);
        saveState();
        renderLive();
      });
      liveSlider.dataset.bound = '1';
    }
    renderLive();

    // Summary
    $('#debt-free-by').textContent = debtFreeBy;
    $('#end-savings').textContent = GBP.format(endSavings);
    $('#avg-cash').textContent = GBP.format(avgCash);
    $('#peak-cash').textContent = GBP.format(peakCash);

    // Debt payoff milestones
    const idx118 = results.findIndex(r => r.balances.d118 <= 0);
    const idxCC  = results.findIndex(r => r.balances.card <= 0);
    const idxUP  = results.findIndex(r => r.balances.up <= 0);
    $('#loan-118-date').textContent = idx118 >= 0 ? monthLabel(idx118) : '—';
    $('#loan-cc-date').textContent  = idxCC  >= 0 ? monthLabel(idxCC)  : '—';
    $('#loan-up-date').textContent  = idxUP  >= 0 ? monthLabel(idxUP)  : '—';

    // Savings milestones (external sweeps)
    const idx5  = results.findIndex(r => (r.externalSavingsTotal || 0) >= 5000);
    const idx10 = results.findIndex(r => (r.externalSavingsTotal || 0) >= 10000);
    const idx15 = results.findIndex(r => (r.externalSavingsTotal || 0) >= 15000);
    $('#save-5k-date').textContent  = idx5  >= 0 ? monthLabel(idx5)  : '—';
    $('#save-10k-date').textContent = idx10 >= 0 ? monthLabel(idx10) : '—';
    $('#save-15k-date').textContent = idx15 >= 0 ? monthLabel(idx15) : '—';

    // Fixed breakdown for selected month
    ensureFixedMonthSelect(results);
    const sel = $('#fixed-month-select');
    const idx = Math.max(0, Math.min(MONTHS-1, parseInt(sel?.value ?? fixedMonthIndex)));
    fixedMonthIndex = idx;
    renderFixedBreakdown(results[idx], peakCash);

    // Debt bars vs starting balances using selected month remaining
    ensureDebtMonthSelect(results);
    const selMonth = Math.max(0, Math.min(MONTHS-1, debtMonthIndex));
    const rem = results[selMonth].balances;
    const totals = DEFAULT_DEBTS.reduce((o,d)=>{o[d.key]=d.balance; return o;},{});
    setDebtBar('118', totals['d118'], rem.d118);
    setDebtBar('cc', totals['card'], rem.card);
    setDebtBar('up', totals['up'], rem.up);
    $('#bal-118').textContent = GBP.format(rem.d118);
    $('#bal-cc').textContent = GBP.format(rem.card);
    $('#bal-up').textContent = GBP.format(rem.up);
    $('#focus-this-month').textContent = results[selMonth].focus;

    // (Savings progress under Debt Progress removed; buffer-related savings now only under Buffer section)

    // Table
    renderTable(results);
  }

  function renderLive(){
    const live = parseNum(state.liveBalance || STARTING_BALANCE);
    const label = $('#live-balance-label');
    if(label) label.textContent = GBP.format(live);
    const bar = $('#live-progress');
    if(bar){
      const pct = Math.max(0, Math.min(1, live / BUFFER_GOAL)) * 100;
      bar.style.width = pct.toFixed(2) + '%';
    }
    const slider = $('#live-balance');
    if(slider){
      slider.value = String(live);
      slider.max = String(6000);
    }
  }

  function renderFixedBreakdown(r, peakCash){
    const wrap = $('#fixed-breakdown');
    wrap.innerHTML = '';
    const rows = [];
    // Subscriptions itemised
    SUBS_ITEMS.forEach(it=> rows.push([it.name, it.amount]));
    rows.push(['Fuel', NON_DEBT_FIXED.fuel + extraFuelForMonth(r.m)]);
    rows.push(['Rent', NON_DEBT_FIXED.rent]);
    rows.push(['Household', NON_DEBT_FIXED.household]);
    rows.push(['Haircuts', NON_DEBT_FIXED.haircuts]);
    rows.push(['Surprise pot', NON_DEBT_FIXED.surprise]);
    const cm = carMaintenanceForMonth(r.m);
    if(cm>0) rows.push(['Car maintenance', cm]);
    const rt = roadTaxForMonth(r.m);
    if(rt>0) rows.push(['Road tax', rt]);
    // Food & Fun for the month (weekly * 4.33 + optional treat uplift)
    const foodFunVal = round2(parseNum(state.weeklyFood) * 4.33 + (state.treats[r.m] ? parseNum(state.treatUplift) : 0));
    rows.push(['Food & Fun', foodFunVal]);
    // Active minimums for this month
    if(state.includeMinimums){
      const debts = state.debts;
      const start = r.startBalances;
      debts.forEach(d=>{
        const stillActive = start[keyMap(d.key)] > 0; // active if positive at start of month
        if(stillActive){
          rows.push([`${d.name} minimum`, d.min]);
        }
      });
    }
    const fixedTotal = rows.reduce((s,[,v])=>s+v,0);

    // One-off outgoings for the selected month (itemized)
    const oneOff = oneOffOutgoings(r.m);

    // Render fixed rows
    rows.forEach(([label,val])=>{
      const div = document.createElement('div');
      div.className = 'row';
      div.innerHTML = `<span>${escapeHtml(label)}</span><span class="mono">${GBP.format(val)}</span>`;
      wrap.appendChild(div);
    });
    // One-off outgoings (items)
    if(oneOff.items.length){
      oneOff.items.forEach(it=>{
        const d = document.createElement('div');
        d.className = 'row';
        d.innerHTML = `<span>${escapeHtml(it.name)}</span><span class="mono">${GBP.format(parseNum(it.amount))}</span>`;
        wrap.appendChild(d);
      });
    }

    // Outgoings total (fixed + food, includes active mins and one-offs inside fixed)
    const outgoingsTotal = r.fixed + r.foodFun;
    const divT = document.createElement('div');
    divT.className = 'row total';
    divT.innerHTML = `<strong>Outgoings total</strong><strong class="mono">${GBP.format(outgoingsTotal)}</strong>`;
    wrap.appendChild(divT);
  }

  function ensureFixedMonthSelect(results){
    const sel = $('#fixed-month-select');
    if(!sel) return;
    if(sel.childElementCount === 0){
      for(let m=0;m<results.length;m++){
        const opt = document.createElement('option');
        opt.value = String(m);
        opt.textContent = monthLabel(m);
        sel.appendChild(opt);
      }
      sel.value = String(fixedMonthIndex);
      sel.addEventListener('change', ()=>{ fixedMonthIndex = parseInt(sel.value||'0'); render(); });
    } else {
      sel.value = String(fixedMonthIndex);
    }
  }

  function ensureBufferMonthSelect(results){
    const sel = $('#buffer-month-select');
    if(!sel) return;
    if(sel.childElementCount === 0){
      for(let m=0;m<results.length;m++){
        const opt = document.createElement('option');
        opt.value = String(m);
        opt.textContent = monthLabel(m);
        sel.appendChild(opt);
      }
      sel.value = String(bufferMonthIndex);
      sel.addEventListener('change', ()=>{ bufferMonthIndex = parseInt(sel.value||'0'); render(); });
    } else {
      sel.value = String(bufferMonthIndex);
    }
  }

  function ensureDebtMonthSelect(results){
    const sel = $('#debt-month-select');
    if(!sel) return;
    if(sel.childElementCount === 0){
      for(let m=0;m<results.length;m++){
        const opt = document.createElement('option');
        opt.value = String(m);
        opt.textContent = monthLabel(m);
        sel.appendChild(opt);
      }
      sel.value = String(debtMonthIndex);
      sel.addEventListener('change', ()=>{ debtMonthIndex = parseInt(sel.value||'0'); render(); });
    } else {
      sel.value = String(debtMonthIndex);
    }
  }

  function keyMap(k){ return k; }

  function setDebtBar(suffix, start, remaining){
    const total = start <= 0 ? 1 : start; // avoid div by zero
    const rem = Math.max(0, remaining);
    // Inverse fill: start full, empty as debt clears
    const pct = Math.max(0, Math.min(1, rem/total)) * 100;
    $(`#bar-${suffix}`).style.width = pct.toFixed(2) + '%';
  }

  function renderTable(results){
    const tbody = $('#plan-table tbody');
    tbody.innerHTML = '';
    results.forEach((r, m)=>{
      const tr = document.createElement('tr');
      tr.appendChild(tdText(monthLabel(m)));

      // Start balance (current account at start of month)
      const tdStart = tdMoney(r.currentStart);
      tdStart.classList.add('start-balance');
      tr.appendChild(tdStart);

      // Income (editable)
      tr.appendChild(tdNumberEditable(state.income[m], val=>{ state.income[m] = parseNum(val); onChange(); }));

      // Special income (editable aggregate)
      {
        const sums = specialSums(m);
        const td = tdNumberEditable(sums.incomeTotal, val=>{
          const sums2 = specialSums(m);
          const base = sums2.incomeBase;
          const target = parseNum(val);
          const sp = state.specials[m] || { spendItems:[], incomeItems:[], spendAdj:0, incomeAdj:0 };
          sp.incomeAdj = round2(target - base);
          state.specials[m] = sp;
          onChange();
        });
        tr.appendChild(td);
      }

      // Outgoings = fixed + food/fun
      const outgoings = r.fixed + r.foodFun;
      tr.appendChild(tdMoney(outgoings));

      tr.appendChild(tdMoney(r.extraApplied));
      tr.appendChild(tdMoney(r.totalOutflow));

      // End balance (end-of-month current account)
      const tdEnd = tdMoney(r.currentEnd);
      tdEnd.classList.add('end-balance');
      if(r.currentEnd <= 0) tdEnd.classList.add('neg');
      tr.appendChild(tdEnd);

      tr.appendChild(tdText(r.focus));
      tr.appendChild(tdMoney(r.balances.d118));
      tr.appendChild(tdMoney(r.balances.card));
      tr.appendChild(tdMoney(r.balances.up));

      // Treat? checkbox
      const tdTreat = document.createElement('td');
      tdTreat.className = 'center';
      const chk = document.createElement('input');
      chk.type = 'checkbox';
      chk.checked = !!state.treats[m];
      chk.addEventListener('change', ()=>{ state.treats[m] = chk.checked; onChange(); });
      tdTreat.appendChild(chk);
      tr.appendChild(tdTreat);

      tbody.appendChild(tr);
    });
  }

  // Elements
  function $(sel){ return document.querySelector(sel); }

  function tdText(text){
    const td = document.createElement('td');
    td.className = 'left';
    td.textContent = text;
    return td;
  }
  function tdMoney(val){
    const td = document.createElement('td');
    td.className = 'mono right';
    td.textContent = GBP.format(val);
    return td;
  }
  function tdNumberEditable(val, oninput){
    const td = document.createElement('td');
    td.className = 'right';
    const input = numInput(val, oninput);
    td.appendChild(input);
    return td;
  }
  function numInput(val, oninput){
    const input = document.createElement('input');
    input.type = 'number';
    input.step = '0.01';
    input.inputMode = 'decimal';
    input.value = toFixedStr(val);
    input.addEventListener('input', ()=> oninput(input.value));
    input.className = 'mono';
    return input;
  }

  // Helpers
  function toFixedStr(n){
    const x = typeof n === 'number' ? n : parseNum(n);
    return (Math.round(x * 100) / 100).toFixed(2);
  }
  function parseNum(v){
    const n = typeof v === 'number' ? v : parseFloat(String(v||'').replace(/[^0-9.-]/g,''));
    return isFinite(n) ? n : 0;
  }
  function round2(n){ return Math.round(n*100)/100; }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;','\'':'&#39;'}[c]));
  }

  // Export CSV
  function exportCSV(){
    const { results } = compute();
    const headers = [
      'Month','Start balance','Income','Special income','Outgoings','Extra → Debt/Savings','Total Outflow','End balance','Focus this month','118 bal','Card bal','Updraft bal','Treat?'
    ];
    const rows = [headers];
    for(const r of results){
      rows.push([
        monthLabel(r.m),
        r.currentStart,
        r.income,
        r.specialIncome,
        (r.fixed + r.foodFun),
        r.extraApplied,
        r.totalOutflow,
        r.currentEnd,
        r.focus,
        r.balances.d118,
        r.balances.card,
        r.balances.up,
        state.treats[r.m] ? 'Yes' : 'No'
      ]);
    }
    const csv = rows.map(row => row.map(cell => formatCSV(cell)).join(',')).join('\n');
    const blob = new Blob([csv], { type:'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'alex-money-plan.csv';
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  function formatCSV(val){
    if(typeof val === 'number'){ return val.toFixed(2); }
    const s = String(val);
    if(/[",\n]/.test(s)) return '"' + s.replace(/"/g,'""') + '"';
    return s;
  }

  // Controls wiring
  function wireControls(){
    // Defaults
    $('#default-income').value = toFixedStr(3100);
    $('#extra-planned').value = toFixedStr(state.extraPlanned);
    $('#weekly-food').value = toFixedStr(state.weeklyFood);
    $('#treat-uplift').value = toFixedStr(state.treatUplift);
    $('#include-mins').checked = !!state.includeMinimums;
    const compact = $('#compact-rows');
    if(compact){ compact.checked = !!state.compactRows; compact.addEventListener('change', ()=>{ state.compactRows = compact.checked; onChange(); }); }

    $('#apply-income-all').addEventListener('click', ()=>{
      const v = parseNum($('#default-income').value);
      for(let m=0;m<MONTHS;m++){
        state.income[m] = (m===0) ? state.income[0] : v; // keep Sep as-is
      }
      onChange();
    });
    $('#extra-planned').addEventListener('input', ()=>{ state.extraPlanned = parseNum($('#extra-planned').value); onChange(); });
    $('#weekly-food').addEventListener('input', ()=>{ state.weeklyFood = parseNum($('#weekly-food').value); onChange(); });
    $('#treat-uplift').addEventListener('input', ()=>{ state.treatUplift = parseNum($('#treat-uplift').value); onChange(); });
    $('#include-mins').addEventListener('change', ()=>{ state.includeMinimums = $('#include-mins').checked; onChange(); });
    $('#export-csv').addEventListener('click', exportCSV);
    $('#reset-data').addEventListener('click', ()=>{ if(confirm('Reset all values to defaults?')){ localStorage.removeItem(LS_KEY); state = loadState() || {
      income: defaultIncome(), specials: defaultSpecials(), treats: defaultTreats(), weeklyFood:50, treatUplift:150, extraPlanned:900, includeMinimums:true, debts: DEFAULT_DEBTS.map(d=>({...d})), version: VERSION
    }; onChange(); }});
  }

  function onChange(){ saveState(); render(); }

  // Init
  document.addEventListener('DOMContentLoaded', ()=>{
    wireControls();
    ensureExtras();
    saveState();
    render();
  });
})();
