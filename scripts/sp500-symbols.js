// S&P 500 constituents — updated periodically as index changes quarterly.
// The buy script uses this as its candidate universe instead of a short watchlist.
// If a symbol has been removed from the index or has bad data, the scoring
// function returns -1 and it gets filtered out automatically.

module.exports = [
  // ── Communication Services ────────────────────────────────────────────────
  'CHTR','CMCSA','DIS','EA','FOX','FOXA','GOOGL','GOOG','IPG',
  'LYV','META','MTCH','NFLX','NWS','NWSA','OMC','PARA','T',
  'TMUS','TTWO','VZ','WBD',

  // ── Consumer Discretionary ────────────────────────────────────────────────
  'AMZN','AN','AZO','BKNG','BWA','CCL','CMG','CZR','DHI','DLTR',
  'DRI','EBAY','ETSY','EXPE','F','GM','GPC','H','HAS','HD',
  'HLT','KMX','LAD','LEN','LOW','LVS','MAR','MAT','MCD','MGM',
  'MHK','NCLH','NKE','NVR','ORLY','PHM','POOL','PVH','RCL','RL',
  'SBUX','TGT','TJX','TOL','TSLA','VFC','WYNN','YUM','AAP','DG',

  // ── Consumer Staples ──────────────────────────────────────────────────────
  'ADM','CAG','CHD','CL','CLX','COST','CPB','EL','GIS','HRL',
  'HSY','K','KHC','KMB','KO','KR','MKC','MNST','MO','PEP',
  'PG','PM','SJM','STZ','SYY','TAP','TSN','ULTA','WBA','WMT',

  // ── Energy ────────────────────────────────────────────────────────────────
  'APA','BKR','COP','CTRA','CVX','DVN','EOG','FANG','HAL','HES',
  'KMI','MPC','MRO','OKE','OXY','PSX','SLB','TRGP','VLO','WMB','XOM',

  // ── Financials ────────────────────────────────────────────────────────────
  'AFL','AIG','AIZ','AJG','ALL','AMP','AON','BAC','BK','BLK',
  'BRK.B','BX','C','CB','CFG','CINF','CME','COF','DFS','FITB',
  'GS','HBAN','ICE','IVZ','JPM','KEY','KKR','L','MA','MET',
  'MMC','MS','MSCI','MTB','NDAQ','NTRS','PFG','PGR','PNC','PRU',
  'RE','RF','RJF','SCHW','SPGI','STT','SYF','TFC','TROW','TRV',
  'USB','V','WFC','ZION','AXP','COF',

  // ── Health Care ───────────────────────────────────────────────────────────
  'A','ABBV','ABT','ALGN','AMGN','BAX','BDX','BIIB','BMY','BSX',
  'CAH','CI','CNC','COO','CRL','CVS','DHR','DXCM','EW','GEHC',
  'GILD','HCA','HUM','HSIC','IDXX','IQV','ISRG','JNJ','LH','LLY',
  'MCK','MDT','MRNA','MRK','MTD','PFE','PODD','REGN','RMD','RVTY',
  'STE','SYK','TFX','TMO','UNH','UHS','VRTX','WAT','ZBH','ZTS',

  // ── Industrials ───────────────────────────────────────────────────────────
  'ALLE','AME','AOS','BA','CAT','CARR','CHRW','CMI','CPRT','CSX',
  'CTAS','DE','DOV','EMR','EXPD','FAST','FDX','FTV','GD','GE',
  'GNRC','GWW','HON','HWM','IEX','ITW','JCI','LHX','LMT','LUV',
  'MAS','MMM','NOC','NSC','ODFL','OTIS','PH','PNR','PWR','ROK',
  'ROP','RTX','SNA','SWK','TDG','TT','UAL','UNP','UPS','URI',
  'VRSK','WAB','WM','XYL','J','RHI','ROL',

  // ── Information Technology ────────────────────────────────────────────────
  'AAPL','ACN','ADBE','ADI','AKAM','AMAT','AMD','ANET','ANSS','APH',
  'AVGO','CDNS','CSCO','CTSH','DELL','DXC','ENPH','EPAM','FSLR','FTNT',
  'GEN','HPE','HPQ','IBM','INTC','IT','JNPR','KEYS','KLAC','LRCX',
  'MCHP','MPWR','MU','MSFT','NTAP','NVDA','ON','ORCL','PANW','PAYC',
  'QCOM','SNPS','STX','TDY','TRMB','TXN','VRSN','WDC','ZBRA','CRM',
  'INTU','ADSK','NOW','WDAY','VEEV','TEAM','DDOG','OKTA','ZS','NET',
  'CRWD','CDW','LDOS','SAIC','BAH','PLTR',

  // ── Materials ─────────────────────────────────────────────────────────────
  'ALB','AVY','BLL','CF','CTVA','DD','DOW','ECL','EMN','FMC',
  'IFF','IP','LIN','LYB','MOS','NEM','NUE','PKG','PPG','PPL',
  'RS','SHW','VMC','WRK','MLM','BALL',

  // ── Real Estate ───────────────────────────────────────────────────────────
  'AMT','ARE','AVB','CBRE','CCI','CPT','DLR','EQR','ESS','EXR',
  'FRT','HST','IRM','KIM','MAA','O','PLD','PSA','REG','SBAC',
  'SPG','UDR','VNO','WY','EQIX',

  // ── Utilities ─────────────────────────────────────────────────────────────
  'AEE','AEP','AES','ATO','AWK','CMS','CNP','D','DTE','DUK',
  'ED','EIX','ES','ETR','EVRG','EXC','FE','LNT','NEE','NI',
  'NRG','NWE','OGE','PCG','PEG','PNW','PPL','SO','SRE','VST',
  'WEC','XEL','CEG',

  // ── Nuclear & Defense additions (high conviction, some S&P 500) ───────────
  'CCJ','BWXT','KTOS','AXON','HII','L3H','HEI',
];
