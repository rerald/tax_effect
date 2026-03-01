/**
 * 넷급여 역산 계산기 - 2024년 기준
 * 세무법인청년들 맞춤형
 */

// 2024년 4대보험료 요율 (일반 근로자 - 고용/산재 포함)
const SOCIAL_INSURANCE_2024 = {
    nationalPension: {
        employeeRate: 0.045,
        employerRate: 0.045,
        maxMonthlyIncome: 5740000,  // 월 574만원 상한
    },
    healthInsurance: {
        rate: 0.0355,
        longTermCareRate: 0.1295,
    },
    employmentInsurance: {
        employeeRate: 0.009,
        employerRate: 0.009,
    },
};

// 2024년 산재보험 업종별 요율 (근로복지공단 기준, %)
const WORKERS_COMP_INDUSTRY_RATES = [
    { id: 'default', name: '일반', rate: 0.007 },
    { id: 'finance', name: '금융 및 보험업', rate: 0.0056 },
    { id: 'professional', name: '전문·보건·교육·여가', rate: 0.0066 },
    { id: 'electronics', name: '전기기계·전자제품제조', rate: 0.0066 },
    { id: 'pharma', name: '의약품·화장품·석유제품', rate: 0.0076 },
    { id: 'realestate', name: '부동산·임대업', rate: 0.0076 },
    { id: 'retail', name: '도소매·음식·숙박', rate: 0.0086 },
    { id: 'facility', name: '시설관리·사업지원', rate: 0.0086 },
    { id: 'other', name: '기타 각종사업', rate: 0.0086 },
    { id: 'food', name: '식료품제조업', rate: 0.0166 },
    { id: 'wood', name: '목재·종이제조', rate: 0.0206 },
    { id: 'transport', name: '육상·수상운수', rate: 0.0186 },
    { id: 'construction', name: '건설업', rate: 0.0356 },
    { id: 'fishing', name: '어업', rate: 0.0276 },
    { id: 'agriculture', name: '농업', rate: 0.0206 },
    { id: 'mining', name: '석탄광업·채석업', rate: 0.1856 },
];

// 2024년 종합소득세 과세표준 세율표 (연간, 만원 단위)
const TAX_BRACKETS_2024 = [
    { min: 0, max: 14000000, rate: 0.06, deduction: 0 },
    { min: 14000000, max: 50000000, rate: 0.15, deduction: 1260000 },
    { min: 50000000, max: 88000000, rate: 0.24, deduction: 5760000 },
    { min: 88000000, max: 150000000, rate: 0.35, deduction: 15440000 },
    { min: 150000000, max: 300000000, rate: 0.38, deduction: 19940000 },
    { min: 300000000, max: 500000000, rate: 0.40, deduction: 25940000 },
    { min: 500000000, max: 1000000000, rate: 0.42, deduction: 35940000 },
    { min: 1000000000, max: Infinity, rate: 0.45, deduction: 65940000 },
];

// 인적공제 (연간, 원)
const PERSONAL_DEDUCTION = 1500000;  // 1인당 150만원

/**
 * 근로소득공제 (연간 총급여 기준)
 */
function calcEarnedIncomeDeduction(annualGross) {
    if (annualGross <= 5000000) return Math.min(annualGross * 0.7, annualGross);
    if (annualGross <= 15000000) return Math.min(annualGross * 0.4 + 1500000, annualGross);
    if (annualGross <= 45000000) return Math.min(annualGross * 0.15 + 5250000, annualGross);
    if (annualGross <= 100000000) return Math.min(annualGross * 0.05 + 9750000, annualGross);
    return Math.min(annualGross * 0.02 + 12750000, annualGross);
}

/**
 * 4대보험료 - 근로자 부담분 (월 기준)
 */
function calcEmployeeSocialInsurance(monthlyGross) {
    const p = SOCIAL_INSURANCE_2024.nationalPension;
    const h = SOCIAL_INSURANCE_2024.healthInsurance;
    const e = SOCIAL_INSURANCE_2024.employmentInsurance;

    const pensionable = Math.min(monthlyGross, p.maxMonthlyIncome);
    const nationalPension = pensionable * p.employeeRate;
    const health = monthlyGross * h.rate;
    const longTermCare = health * h.longTermCareRate;
    const employment = monthlyGross * e.employeeRate;

    return {
        nationalPension,
        healthInsurance: health,
        longTermCare,
        employment,
        total: nationalPension + health + longTermCare + employment,
    };
}

/**
 * 4대보험료 - 사업주 부담분 (월 기준)
 * @param {number} monthlyGross - 월 과세 총급여
 * @param {number} [workersCompRate] - 산재보험 요율 (미입력 시 0.7% 기본)
 */
function calcEmployerSocialInsurance(monthlyGross, workersCompRate) {
    const p = SOCIAL_INSURANCE_2024.nationalPension;
    const h = SOCIAL_INSURANCE_2024.healthInsurance;
    const e = SOCIAL_INSURANCE_2024.employmentInsurance;
    const rate = typeof workersCompRate === 'number' ? workersCompRate : 0.007;

    const pensionable = Math.min(monthlyGross, p.maxMonthlyIncome);
    const nationalPension = pensionable * p.employerRate;
    const health = monthlyGross * h.rate;
    const longTermCare = health * h.longTermCareRate;
    const employment = monthlyGross * e.employerRate;
    const workersComp = monthlyGross * rate;

    return {
        nationalPension,
        healthInsurance: health,
        longTermCare,
        employment,
        workersCompensation: workersComp,
        workersCompRate: rate,
        total: nationalPension + health + longTermCare + employment + workersComp,
    };
}

/**
 * 소득세 산출 (연 과세표준 기준)
 */
function calcIncomeTax(annualTaxableIncome) {
    if (annualTaxableIncome <= 0) return 0;
    for (const b of TAX_BRACKETS_2024) {
        if (annualTaxableIncome >= b.min && annualTaxableIncome <= b.max) {
            return Math.max(Math.round(annualTaxableIncome * b.rate - b.deduction), 0);
        }
    }
    return 0;
}

/**
 * 월 급여(과세)로부터 Net 실수령액 계산
 * @param {number} monthlyGross - 월 과세 총급여
 * @param {number} dependents - 부양가족 수 (본인 포함)
 * @param {number} childrenUnder20 - 20세 이하 자녀 수
 */
function calcNetFromGross(monthlyGross, dependents, childrenUnder20) {
    const annualGross = monthlyGross * 12;

    // 근로소득공제
    const earnedDeduction = calcEarnedIncomeDeduction(annualGross);
    const earnedIncome = annualGross - earnedDeduction;

    // 4대보험 (월)
    const insurance = calcEmployeeSocialInsurance(monthlyGross);
    const annualInsurance = insurance.total * 12;

    // 인적공제 (20세 이하 자녀는 추가 공제 - 간이세액표 반영: 자녀 1인당 약 30만원 추가)
    const childExtra = (childrenUnder20 || 0) * 300000;
    const personalDeduction = dependents * PERSONAL_DEDUCTION + childExtra;

    // 과세표준 (연)
    const taxableIncome = Math.max(earnedIncome - annualInsurance - personalDeduction, 0);

    // 소득세 + 지방소득세
    const incomeTax = calcIncomeTax(taxableIncome);
    const localTax = Math.round(incomeTax * 0.1);
    const totalTax = incomeTax + localTax;

    // 월 차감액 (원천징수는 연간 기준이므로 월별 비례)
    const monthlyTax = totalTax / 12;

    const net = monthlyGross - insurance.total - monthlyTax;

    return {
        net,
        gross: monthlyGross,
        insurance,
        monthlyTax,
        totalTax,
        incomeTax,
        localTax,
        taxableIncome: taxableIncome / 12,
        earnedIncome: earnedIncome / 12,
    };
}

/**
 * Net으로부터 Gross 역산 (이분 탐색)
 */
function reverseCalcGross(targetNet, dependents, childrenUnder20, nonTaxableTotal) {
    // 목표 Net = 과세 Gross에서 공제/세금 뺀 금액
    // 비과세는 실수령에 포함되므로, targetNet이 비과세 포함인지 제외인지 확인
    // 기술서: "목표 세후 월 실수령액" = Net (비과세 포함 가능)
    // 실수령 = (과세 Gross - 4대보험 - 세금) + 비과세
    // 따라서: targetNet - 비과세 = 과세 Gross - 4대보험 - 세금
    const targetFromTaxable = targetNet - (nonTaxableTotal || 0);

    if (targetFromTaxable <= 0) {
        return { gross: 0, error: '목표 실수령액을 확인해 주세요.' };
    }

    let low = Math.ceil(targetFromTaxable);
    let high = Math.ceil(targetFromTaxable * 2.5);  // 상한 (고소득 대비)
    const maxIter = 100;

    for (let i = 0; i < maxIter; i++) {
        const mid = Math.round((low + high) / 2);
        const result = calcNetFromGross(mid, dependents, childrenUnder20);
        const netFromTaxable = result.gross - result.insurance.total - result.monthlyTax;

        if (Math.abs(netFromTaxable - targetFromTaxable) < 10) {
            return {
                gross: mid,
                ...result,
                nonTaxableTotal: nonTaxableTotal || 0,
            };
        }
        if (netFromTaxable < targetFromTaxable) low = mid;
        else high = mid;
    }

    const finalGross = Math.round((low + high) / 2);
    const finalResult = calcNetFromGross(finalGross, dependents, childrenUnder20);
    return {
        gross: finalGross,
        ...finalResult,
        nonTaxableTotal: nonTaxableTotal || 0,
    };
}

/**
 * 사업주 총 부담액 (근로자 부담분 + 사업주 부담분 모두 사업주가 부담하는 경우)
 * @param {number} monthlyGross - 월 과세 총급여
 * @param {number} [workersCompRate] - 산재보험 요율 (미입력 시 0.7% 기본)
 */
function calcEmployerTotalCost(monthlyGross, workersCompRate) {
    const employeeInsurance = calcEmployeeSocialInsurance(monthlyGross);
    const employerInsurance = calcEmployerSocialInsurance(monthlyGross, workersCompRate);
    const severanceReserve = monthlyGross / 12;  // 퇴직금 월 적립
    const totalInsurance = employeeInsurance.total + employerInsurance.total;
    return {
        gross: monthlyGross,
        employeeInsurance: employeeInsurance.total,
        employerInsurance: employerInsurance.total,
        totalInsurance,
        severanceReserve,
        total: monthlyGross + totalInsurance + severanceReserve,
    };
}

function formatWon(won) {
    if (won === 0) return '0원';
    return Math.round(won).toLocaleString('ko-KR') + '원';
}
