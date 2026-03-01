/**
 * 사업용 차량 최적화 및 절세 시뮬레이터
 * 세무법인청년들 | 소득세법 시행령 제78조의3 기준
 */

// 2024년 종합소득세 한계세율 (만원 단위) - net-salary.js의 TAX_BRACKETS_2024와 구분
const MARGINAL_TAX_BRACKETS = [
    { min: 0, max: 1400, rate: 0.06 },      // 1,400만원 이하
    { min: 1400, max: 5000, rate: 0.15 },   // 5,000만원 이하
    { min: 5000, max: 8800, rate: 0.24 },   // 8,800만원 이하
    { min: 8800, max: 15000, rate: 0.35 },  // 1.5억원 이하
    { min: 15000, max: 30000, rate: 0.38 }, // 3억원 이하
    { min: 30000, max: 50000, rate: 0.40 }, // 5억원 이하
    { min: 50000, max: 100000, rate: 0.42 },// 10억원 이하
    { min: 100000, max: Infinity, rate: 0.45 },
];

// 2024년 법인세 표준세율 (만원 단위)
// 2억 이하 9%, 2억~200억 19%, 200억~3000억 21%, 3000억~ 24%
const CORPORATE_TAX_BRACKETS = [
    { min: 0, max: 20000, rate: 0.09 },     // 2억 이하
    { min: 20000, max: 2000000, rate: 0.19 }, // 200억 이하
    { min: 2000000, max: 300000000, rate: 0.21 }, // 3000억 이하
    { min: 300000000, max: Infinity, rate: 0.24 },
];

// 세법 상수
const ANNUAL_COST_LIMIT = 15000000;   // 연간 비용 인정 한도 1,500만원 (운행기록부 미작성)
const LOGBOOK_RECOGNITION_RATE = 1.0; // 비용 인정률 100%
const DEPRECIATION_LIMIT = 8000000;   // 감가상각비 상당액 한도 800만원
const LEASE_RATE = 0.93;              // 리스 93%
const RENT_RATE = 0.70;              // 장기렌트 70%
const GREEN_PLATE_THRESHOLD = 80000000; // 8,000만원 이상 연두색 번호판

// 설문 점수 카테고리
const CATEGORIES = {
    installment: '할부/일시불',
    lease: '리스',
    rent: '장기렌트',
};

// 설문 상태
let surveyState = {
    currentQuestion: 1,
    answers: {},
    scores: { installment: 0, lease: 0, rent: 0 },
};

// 사업자 유형 ('individual' | 'corporate')
let currentBusinessType = 'individual';

// 설문 가점 로직 (명세서 기준)
const SCORING_RULES = [
    { q: 1, yes: { lease: 10, installment: 10 }, no: { rent: 5 } },
    { q: 2, yes: { rent: 10 }, no: {} },
    { q: 3, yes: { rent: 10 }, no: { lease: 5, installment: 5 } },
    { q: 4, yes: { installment: 10 }, no: { lease: 10, rent: 10 } },
];

function applyScore(answer, isYes) {
    const rule = SCORING_RULES[answer - 1];
    const points = isYes ? rule.yes : rule.no;
    for (const [key, val] of Object.entries(points)) {
        surveyState.scores[key] += val;
    }
}

function answerQuestion(qNum, isYes) {
    surveyState.answers[qNum] = isYes;
    applyScore(qNum, isYes);

    if (qNum < 4) {
        surveyState.currentQuestion = qNum + 1;
        showQuestion(qNum + 1);
        updateProgress(qNum + 1, 4);
    } else {
        finishSurvey();
    }
}

function showQuestion(qNum) {
    document.querySelectorAll('.question-card').forEach((el, i) => {
        el.classList.toggle('hidden', i + 1 !== qNum);
    });
}

function updateProgress(current, total) {
    const pct = (current / total) * 100;
    document.getElementById('progress-bar').style.width = pct + '%';
    document.getElementById('progress-text').textContent = current + '/' + total;
}

function getRecommendation() {
    const scores = surveyState.scores;
    const sorted = Object.entries(scores)
        .sort((a, b) => b[1] - a[1])
        .map(([key, val]) => ({ key, label: CATEGORIES[key], score: val }));

    const optimal = sorted[0];
    const alternative = sorted[1];
    return { optimal, alternative };
}

function toggleBusinessType(type) {
    currentBusinessType = type;
    document.getElementById('toggle-individual').classList.toggle('active', type === 'individual');
    document.getElementById('toggle-corporate').classList.toggle('active', type === 'corporate');
    document.getElementById('comp-header-title').textContent = type === 'individual' ? '개인사업자 명의' : '법인사업자 명의';
    document.getElementById('comp-col-header').textContent = type === 'individual' ? '개인사업자 명의' : '법인사업자 명의';
    if (typeof lastCalcResult !== 'undefined' && lastCalcResult) {
        renderComparisonTable(lastCalcResult);
    }
}

function toggleComparisonDetail() {
    const detailEl = document.getElementById('comp-detail');
    const iconEl = document.getElementById('comp-detail-icon');
    const textEl = document.getElementById('comp-detail-toggle-text');
    if (detailEl.classList.contains('hidden')) {
        detailEl.classList.remove('hidden');
        iconEl.textContent = '▼';
        textEl.textContent = '세부내역 접기';
    } else {
        detailEl.classList.add('hidden');
        iconEl.textContent = '▶';
        textEl.textContent = '세부내역 펼치기';
    }
}

function finishSurvey() {
    const { optimal, alternative } = getRecommendation();

    // Step 2 표시
    const step2 = document.getElementById('step2-section');
    step2.classList.remove('opacity-0', 'pointer-events-none');

    // 사업자 유형 기본값
    currentBusinessType = 'individual';
    document.getElementById('toggle-individual').classList.add('active');
    document.getElementById('toggle-corporate').classList.remove('active');

    // 추천 결과를 product-type에 반영
    const productSelect = document.getElementById('product-type');
    const typeMap = { installment: 'installment', lease: 'lease', rent: 'rent' };
    productSelect.value = typeMap[optimal.key];
    productSelect.dispatchEvent(new Event('change'));

    // 추천 요약 표시
    const summaryEl = document.getElementById('recommendation-summary');
    summaryEl.classList.remove('hidden');
    summaryEl.textContent = `추천: ${optimal.label} (대안: ${alternative.label})`;
    summaryEl.dataset.optimal = optimal.key;
    summaryEl.dataset.alternative = alternative.key;

    // Step 1 스크롤 후 Step 2로 자동 스크롤
    step2.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

// 통화 파싱
function parseCurrency(input) {
    const cleaned = String(input || '').replace(/,/g, '').trim();
    const num = parseInt(cleaned, 10);
    return isNaN(num) || num < 0 ? 0 : num;
}

// 개인사업자 한계세율 (연봉 기준, 만원 단위)
function getIndividualMarginalRate(annualSalaryWon) {
    const manwon = Math.floor(annualSalaryWon / 10000);
    for (const b of MARGINAL_TAX_BRACKETS) {
        if (manwon <= b.max) return b.rate;
    }
    return 0.45;
}

// 법인사업자 한계세율 (연소득 기준, 만원 단위)
function getCorporateMarginalRate(annualIncomeWon) {
    const manwon = Math.floor(annualIncomeWon / 10000);
    for (const b of CORPORATE_TAX_BRACKETS) {
        if (manwon <= b.max) return b.rate;
    }
    return 0.24;
}

// 금액 포맷
function formatWon(won) {
    if (won === 0) return '0원';
    return (won / 10000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' 만원';
}

function formatPercent(rate) {
    return (rate * 100).toFixed(1) + '%';
}


/**
 * 개인 차량 비용 충당을 위한 추가 급여 역산 (이분 탐색)
 * (repSalary + addGross) 기준 실수령 - repSalary 기준 실수령 = vehicleCost
 */
function calcAdditionalGrossForVehicleCost(repSalary, vehicleCost, dependents) {
    dependents = dependents || 1;
    if (vehicleCost <= 0) {
        return { addGross: 0, addIncomeTax: 0, addEmployeeIns: 0, addEmployerIns: 0, totalBurden: 0 };
    }
    const baseMonthlyGross = repSalary / 12;
    const baseResult = typeof calcNetFromGross === 'function'
        ? calcNetFromGross(baseMonthlyGross, dependents, 0)
        : null;
    if (!baseResult) return { addGross: 0, addIncomeTax: 0, addEmployeeIns: 0, addEmployerIns: 0, totalBurden: 0 };

    let low = 0;
    let high = Math.ceil(vehicleCost * 2.5);
    const maxIter = 80;
    let addGross = 0;

    for (let i = 0; i < maxIter; i++) {
        addGross = Math.round((low + high) / 2);
        const newMonthlyGross = (repSalary + addGross) / 12;
        const newResult = calcNetFromGross(newMonthlyGross, dependents, 0);
        const incrementalNet = (newResult.net - baseResult.net) * 12;

        if (Math.abs(incrementalNet - vehicleCost) < 100) break;
        if (incrementalNet < vehicleCost) low = addGross;
        else high = addGross;
    }

    return calcPersonalVehicleBurden(repSalary, addGross, dependents);
}

/**
 * 개인 차량 시 추가 부담 (추가 소득세, 4대보험)
 */
function calcPersonalVehicleBurden(repSalary, addGross, dependents) {
    dependents = dependents || 1;
    if (addGross <= 0) {
        return { addGross: 0, addIncomeTax: 0, addEmployeeIns: 0, addEmployerIns: 0, totalBurden: 0 };
    }

    const baseMonthly = repSalary / 12;
    const newMonthly = (repSalary + addGross) / 12;

    const baseResult = calcNetFromGross(baseMonthly, dependents, 0);
    const newResult = calcNetFromGross(newMonthly, dependents, 0);

    const addIncomeTax = Math.round(newResult.totalTax - baseResult.totalTax);
    const addEmployeeIns = Math.round((newResult.insurance.total - baseResult.insurance.total) * 12);
    const addEmployerIns = Math.round(
        (calcEmployerSocialInsurance(newMonthly).total - calcEmployerSocialInsurance(baseMonthly).total) * 12
    );
    // 근로자 4대보험은 addGross 역산에 이미 반영되어 있으므로 총 부담에서 제외 (2중계산 방지)
    const totalBurden = addIncomeTax + addEmployerIns;

    return {
        addGross,
        addIncomeTax,
        addEmployeeIns,
        addEmployerIns,
        totalBurden,
    };
}

// 차액 포맷 (부호 포함)
function formatDiffWon(diff) {
    if (diff === 0) return '동일';
    const abs = Math.abs(diff);
    const str = (abs / 10000).toFixed(0).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' 만원';
    return diff > 0 ? '+' + str : '-' + str;
}

let lastCalcResult = null;

function renderComparisonTable(result) {
    const isIndividual = currentBusinessType === 'individual';
    const A = result.annualCost;
    const C = result.personalBurden ? result.personalBurden.totalBurden : 0;
    const D = result.corpTaxSavingsFromAddSalary || 0;

    // 개인명의: 개인사업자 시 절감 0, 법인사업자 시 절감 ③(추가급여 비용처리 법인세 절감)
    const personalSaving = isIndividual ? 0 : D;
    const personalNetAnnual = A + (isIndividual ? 0 : C) - personalSaving;
    const personalNet5yr = personalNetAnnual * 5;

    // 사업자명의: 개인사업자 시 소득세+4대보험, 법인사업자 시 ①(차량비용 법인세 절감)만
    const businessSaving = isIndividual ? result.indivTaxSaving + result.indivInsuranceEffect : (result.corpVehicleTaxSaving || result.corpTaxSaving);
    const businessNetAnnual = A - businessSaving;
    const businessNet5yr = businessNetAnnual * 5;

    document.getElementById('comp-personal-cost').textContent = formatWon(A);
    document.getElementById('comp-business-cost').textContent = formatWon(A);

    const extraRow = document.getElementById('comp-extra-burden-row');
    const extra5yrRow = document.getElementById('comp-extra-burden-5yr-row');
    if (isIndividual) {
        extraRow.classList.add('hidden');
        extra5yrRow.classList.add('hidden');
    } else {
        extraRow.classList.remove('hidden');
        extra5yrRow.classList.remove('hidden');
        document.getElementById('comp-personal-extra').textContent = formatWon(C);
        document.getElementById('comp-personal-extra-5yr').textContent = formatWon(C * 5);
    }

    document.getElementById('comp-personal-saving').textContent = personalSaving > 0 ? formatWon(personalSaving) : '0';
    document.getElementById('comp-business-saving').textContent = formatWon(businessSaving);
    document.getElementById('comp-personal-net').textContent = formatWon(personalNetAnnual);
    document.getElementById('comp-business-net').textContent = formatWon(businessNetAnnual);

    document.getElementById('comp-personal-cost-5yr').textContent = formatWon(A * 5);
    document.getElementById('comp-business-cost-5yr').textContent = formatWon(A * 5);
    document.getElementById('comp-personal-saving-5yr').textContent = personalSaving > 0 ? formatWon(personalSaving * 5) : '0';
    document.getElementById('comp-business-saving-5yr').textContent = formatWon(businessSaving * 5);
    document.getElementById('comp-personal-net-5yr').textContent = formatWon(personalNet5yr);
    document.getElementById('comp-business-net-5yr').textContent = formatWon(businessNet5yr);

    // 연간/5년간 절세효과 (개인명의 대비 사업자명의 선택 시 절약액)
    const annualEffect = personalNetAnnual - businessNetAnnual;
    const effect5yr = personalNet5yr - businessNet5yr;
    document.getElementById('comp-annual-effect').textContent = formatWon(annualEffect) + ' (개인명의 대비 절약)';
    document.getElementById('comp-5yr-effect').textContent = formatWon(effect5yr) + ' (개인명의 대비 절약)';

    // 세부내역
    document.getElementById('comp-rate').textContent = formatPercent(isIndividual ? result.indivRate : result.corpRate);
    document.getElementById('comp-allowable').textContent = formatWon(result.allowableCost);

    const indivBreakdown = document.getElementById('comp-indiv-breakdown');
    const corpBreakdown = document.getElementById('comp-corp-breakdown');
    const corpBurden = document.getElementById('comp-corp-burden');
    const corpPersonalSaving = document.getElementById('comp-corp-personal-saving');
    if (isIndividual) {
        indivBreakdown.classList.remove('hidden');
        corpBreakdown.classList.add('hidden');
        corpBurden.classList.add('hidden');
        if (corpPersonalSaving) corpPersonalSaving.classList.add('hidden');
        document.getElementById('comp-indiv-tax').textContent = formatWon(result.indivTaxSaving);
        document.getElementById('comp-indiv-insurance').textContent = formatWon(result.indivInsuranceEffect);
    } else {
        indivBreakdown.classList.add('hidden');
        corpBreakdown.classList.remove('hidden');
        document.getElementById('comp-corp-vehicle-tax').textContent = formatWon(result.corpVehicleTaxSaving || 0);
        if (corpPersonalSaving) {
            corpPersonalSaving.classList.remove('hidden');
            document.getElementById('comp-corp-add-salary-tax-val').textContent = formatWon(D);
        }
        if (result.personalBurden && result.personalBurden.totalBurden > 0) {
            corpBurden.classList.remove('hidden');
            document.getElementById('comp-add-gross').textContent = formatWon(result.personalBurden.addGross);
            document.getElementById('comp-add-tax').textContent = formatWon(result.personalBurden.addIncomeTax);
            document.getElementById('comp-add-empr').textContent = formatWon(result.personalBurden.addEmployerIns);
            document.getElementById('comp-total-burden').textContent = formatWon(result.personalBurden.totalBurden);
        } else {
            corpBurden.classList.add('hidden');
        }
    }

    ['comp-personal-net', 'comp-business-net', 'comp-personal-net-5yr', 'comp-business-net-5yr'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.classList.add('updated');
            setTimeout(() => el.classList.remove('updated'), 500);
        }
    });
}

function calculateTaxSavings() {
    const vehiclePrice = parseCurrency(document.getElementById('vehicle-price').value);
    const monthlyFee = parseCurrency(document.getElementById('monthly-fee').value);
    const repSalary = parseCurrency(document.getElementById('representative-salary').value);
    const maintenance = parseCurrency(document.getElementById('maintenance-cost').value);

    if (repSalary <= 0) {
        alert('대표 연봉을 입력해 주세요. 한계세율 산출에 필요합니다.');
        document.getElementById('representative-salary').focus();
        return;
    }

    const productType = document.getElementById('product-type').value;
    if ((productType === 'lease' || productType === 'rent') && monthlyFee <= 0) {
        alert('월 리스/렌트료를 입력해 주세요.');
        document.getElementById('monthly-fee').focus();
        return;
    }

    const monthlyFeeForCalc = monthlyFee;
    const corpRate = getCorporateMarginalRate(repSalary);
    const indivRate = getIndividualMarginalRate(repSalary);

    const annualCost = monthlyFeeForCalc * 12 + maintenance;
    const allowableCost = Math.round(annualCost * LOGBOOK_RECOGNITION_RATE);

    const vehicleCost = annualCost;
    const personalBurden = typeof calcNetFromGross === 'function'
        ? calcAdditionalGrossForVehicleCost(repSalary, vehicleCost, 1)
        : { addGross: 0, addIncomeTax: 0, addEmployeeIns: 0, addEmployerIns: 0, totalBurden: 0 };

    // 개인사업자: 소득세 절감 + 4대보험 효과
    const indivTaxSaving = Math.round(allowableCost * indivRate);
    const indivInsuranceEffect = personalBurden.addEmployeeIns + personalBurden.addEmployerIns;

    // 법인사업자: ① 차량비용 법인세 절감 (법인사업자 명의), ③ 추가급여 비용처리 법인세 절감 (개인명의 시)
    const corpVehicleTaxSaving = Math.round(allowableCost * corpRate);
    const corpTaxSavingsFromAddSalary = Math.round(
        (personalBurden.addGross + personalBurden.addEmployerIns) * corpRate
    );

    lastCalcResult = {
        annualCost,
        allowableCost,
        corpRate,
        indivRate,
        personalBurden,
        indivTaxSaving,
        indivInsuranceEffect,
        corpTaxSaving: corpVehicleTaxSaving,
        corpVehicleTaxSaving,
        corpTaxSavingsFromAddSalary,
    };

    renderComparisonTable(lastCalcResult);

    // 세부내역 접기
    const detailEl = document.getElementById('comp-detail');
    if (detailEl) detailEl.classList.add('hidden');
    const iconEl = document.getElementById('comp-detail-icon');
    const textEl = document.getElementById('comp-detail-toggle-text');
    if (iconEl) iconEl.textContent = '▶';
    if (textEl) textEl.textContent = '세부내역 펼치기';

    const greenWarning = document.getElementById('green-plate-warning');
    if (vehiclePrice >= GREEN_PLATE_THRESHOLD) {
        greenWarning.classList.remove('hidden');
        greenWarning.textContent = '법인 차량의 경우 연두색 번호판 부착 대상입니다.';
    } else {
        greenWarning.classList.add('hidden');
    }
}

// 통화 입력 필드 천단위 콤마
function initCurrencyInputs() {
    document.querySelectorAll('.currency-input').forEach(input => {
        input.addEventListener('input', function () {
            let v = this.value.replace(/[^0-9]/g, '');
            this.value = v ? parseInt(v, 10).toLocaleString('ko-KR') : '';
        });
    });
}

// 상품 유형 변경 시 월료 라벨 업데이트
function initProductTypeChange() {
    const productSelect = document.getElementById('product-type');
    const label = document.querySelector('#monthly-fee-group label');
    productSelect.addEventListener('change', function () {
        const v = this.value;
        if (v === 'installment') {
            label.textContent = '월 할부/상환금 (원) - 선택';
        } else if (v === 'lease') {
            label.textContent = '월 리스료 (원)';
        } else {
            label.textContent = '월 렌트료 (원)';
        }
    });
}

// 초기화
document.addEventListener('DOMContentLoaded', function () {
    initCurrencyInputs();
    initProductTypeChange();
});
