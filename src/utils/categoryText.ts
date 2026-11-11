/**
 * 이름·문구 → 분류표(CATEGORY_HIERARCHY) 카테고리("1차" 또는 "1차 > 2차").
 * 견적 제목, 그리고 정확 매핑표(CAT_LOOKUP)에 없는 캠페인·광고그룹 이름에 쓴다.
 * apps-script/Code.gs 의 CATEGORY_TEXT_RULES_ 와 같은 표 — 한쪽을 고치면 다른 쪽도 고친다.
 *
 * 위에서부터 먼저 맞는 규칙을 쓴다. 그래서 "제품 종류·솔루션"을 "브랜드 서버"보다 먼저 둔다
 * (예: "Dell 모니터"는 모니터, "HP Z4 워크스테이션"은 워크스테이션, "Dell EMC Unity"는 스토리지).
 */
const CATEGORY_TEXT_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  // 단일 브랜드·제품군
  [/3\s?d\s?connexion|spacemouse|cadmouse/, '3Dconnexion'],
  [/ai\s?station|zgx|dgx\s?spark/, 'AI Station'],
  [/gstar|g\s?캐드|지스타/, 'GstarCAD'],
  // 네트워크/방화벽 — 화웨이는 스토리지에도 있어 함께 쓰인 말로 가른다
  [/fortigate|포티게이트|\bfg-?\d/, '네트워크/방화벽 > FortiGate'],
  [/palo\s?alto|팔로\s?알토/, '네트워크/방화벽 > PaloAlto'],
  [/(방화벽|네트워크|스위치|\bap\d*\b).*(화웨이|huawei)|(화웨이|huawei).*(방화벽|네트워크|스위치|\bap\d*\b)/, '네트워크/방화벽 > 화웨이'],
  [/방화벽|firewall|\butm\b|스위치|switch|네트워크|network|라우터|router|\bsfp\b|\bap\d*\b/, '네트워크/방화벽'],
  // 스토리지
  [/시놀로지|synology/, 'NAS 스토리지 > 시놀로지'],
  [/\bnas\b|나스|qnap|큐냅/, 'NAS 스토리지'],
  [/netapp|넷앱/, 'SAN 스토리지 > NetAPP'],
  [/\bmsa\b/, 'SAN 스토리지 > MSA'],
  [/oceanstor|dorado|(화웨이|huawei).*(스토리지|storage|san)|(스토리지|storage|san).*(화웨이|huawei)/, 'SAN 스토리지 > 화웨이'],
  [/스토리지|storage|\bsan\b|\bdas\b|unity|powervault|powerstore/, 'SAN 스토리지'],
  // 솔루션
  [/백업|backup|veeam|arcserve|acronis/, '백업 솔루션'],
  [/rose\s?ha|mccs|이중화|클러스터/, '이중화 솔루션'],
  [/vmware|가상화|hyper-?v|proxmox|nutanix|\bvdi\b/, '가상화 솔루션'],
  [/\bpoly\b|폴리/, '화상회의솔루션 > Poly'],
  [/화상\s?회의|화상\s?장비|웹캠|스피커폰/, '화상회의솔루션'],
  [/\bv3\b|안랩|보안\s?소프트웨어|백신/, '소프트웨어 > 보안 소프트웨어'],
  [/소프트웨어|software|라이선스|license|windows|오피스|office|autocad|오토캐드|한컴/, '소프트웨어 > 기타 소프트웨어'],
  [/\bups|무정전|\bapc\b/, 'UPS'],
  // 디스플레이 — 사이니지·전자칠판을 모니터보다 먼저
  [/사이니지|signage/, 'LG전자 > 사이니지'],
  [/전자\s?칠판|createboard|원퀵|터치\s?디스플레이/, 'LG전자 > 전자칠판'],
  [/모니터|monitor|디스플레이|display/, '모니터'],
  // 워크스테이션 — 모바일을 먼저
  [/zbook|\bmws\b|모바일\s?워크스테이션|mobile\s?workstation/, '모바일 워크스테이션'],
  [/워크스테이션|workstation|z\s?by\s?hp|zbyhp|\bz[1-9]\b|\bz[1-9]\s?g\d|z\s?central|precision|thinkstation/, '데스크탑 워크스테이션'],
  // GPU/AI 서버 (옛 캠페인명 "Data Science" 포함)
  [/gpu|딥러닝|머신러닝|data\s?science|데이터\s?사이언스|\brtx|h100|h200|a100|l40s?|b200|instinct|\bmi\d{3}|\besc\d{4}|epyc|tyan|mitac|supermicro|슈퍼마이크로/, 'GPU/AI 서버'],
  // 노트북·서피스
  [/서피스|surface/, 'MS서피스'],
  [/thinkpad|씽크패드|ideapad|아이디어패드|레노버\s?노트북|lenovo\s?노트북/, '노트북 > Lenovo 노트북'],
  [/elitebook|엘리트북|probook|프로북|파빌리온|pavilion|omen|오멘|omnibook|victus|hp\s?노트북|hp노트북|hp\s?\d{3}r?\s?g\d/, '노트북 > HP 노트북'],
  [/노트북|laptop|expertbook|vivobook|zenbook|그램|macbook|맥북/, '노트북'],
  // 브랜드 서버 → 브랜드 없는 서버(서버공통)
  [/hpe|proliant|\bdl\d{2,3}|\bml\d{2,3}/, 'HPE 서버'],
  [/poweredge|dell|델\s?서버|델서버/, 'Dell 서버'],
  [/thinksystem|lenovo|레노버/, 'Lenovo 서버'],
  [/서버|server|랙|rack/, '서버공통(주변장비)'],
  // 데스크탑
  [/엘리트\s?보드|eliteboard|elite\s?desk|엘리트\s?데스크|pro\s?desk|프로\s?데스크|프로\s?미니|pro\s?mini|엘리트\s?타워|elite\s?tower|프로\s?슬림|pro\s?slim|\bnuc\b|mac\s?studio|데스크탑|데스크톱|desktop|\bpc\b|올인원|본체|컴퓨터/, '데스크탑'],
  // 서비스
  [/유지\s?보수|기술\s?문의|a\/s|수리/, '유지보수/기술문의'],
  [/리스|렌탈|대여|데모|demo/, '리스/렌탈/데모'],
];

/** 이름·문구에서 카테고리를 찾는다. 맞는 규칙이 없으면 '기타' */
export function categoryFromText(text: string): string {
  // 광고 이름의 밑줄(GDN_MWS, 시놀로지_NAS)은 띄어쓰기로 본다 — 그래야 \b 단어 경계가 잡힌다
  const t = String(text || '').toLowerCase().replace(/_/g, ' ');
  if (!t.trim()) return '기타';
  for (const [re, cat] of CATEGORY_TEXT_RULES) if (re.test(t)) return cat;
  return '기타';
}

/**
 * 캠페인·광고그룹 이름으로 카테고리를 찾는다 (정확 매핑표에 없을 때).
 * 광고그룹 이름만으로 먼저 보고(쇼핑검색·자사몰처럼 여러 카테고리를 담는 캠페인), 모자라면 캠페인 이름과 함께 본다.
 */
export function categoryFromAdNames(campaign: string, adgroup: string): string {
  const byGroup = categoryFromText(adgroup);
  if (byGroup !== '기타') return byGroup;
  return categoryFromText(`${campaign} ${adgroup}`);
}

/**
 * 고도몰 판매 제품명에만 먼저 적용하는 보정 규칙 — 공용 규칙(견적 제목·광고 이름, Apps Script 와 같은 표)은 그대로 두고,
 * 제품명 표기 때문에 틀리게 잡히는 것만 바로잡는다 (예: RTX 그래픽이 든 데스크탑이 GPU/AI 서버로, 모니터를 끼운 ZBook 이 모니터로).
 */
const GOODS_CATEGORY_RULES: ReadonlyArray<readonly [RegExp, string]> = [
  [/zbook/, '모바일 워크스테이션'],
  [/엘리트\s?데스크|elite\s?desk|pro\s?tower|프로\s?타워|deskmini/, '데스크탑'],
  [/\bhp\]?\s?\d{3}r?\s?g\d/, '노트북 > HP 노트북'],
  [/win(dows)?\s?svr|sql\s?svr/, '소프트웨어 > 기타 소프트웨어'],
];

/** 고도몰 판매 제품명 → 카테고리. 보정 규칙을 먼저 보고, 없으면 공용 규칙(categoryFromText) */
export function goodsCategoryOf(name: string): string {
  const t = String(name || '').toLowerCase();
  for (const [re, cat] of GOODS_CATEGORY_RULES) if (re.test(t)) return cat;
  return categoryFromText(name);
}

/**
 * 견적 → 카테고리. 제목으로 먼저 찾고, "견적 요청"처럼 제품 정보가 없으면
 * 유입경로의 광고 꼬리표(예: "네이버(광고) - ROSEHA" 의 ROSEHA)로 한 번 더 찾는다.
 * 수집 스크립트 quoteCategory_ 와 같은 순서.
 */
export function quoteCategoryOf(subject: string, sourceDetail = ''): string {
  const bySubject = categoryFromText(subject);
  return bySubject !== '기타' ? bySubject : categoryFromText(sourceDetail);
}
