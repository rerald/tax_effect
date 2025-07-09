// 세금 계산 관련 상수들
const TAX_RATES = {
    // 종합소득세 누진세율 (2025년 기준)
    income: [
        { min: 0, max: 14000000, rate: 0.06, deduction: 0 },
        { min: 14000000, max: 50000000, rate: 0.15, deduction: 1260000 },
        { min: 50000000, max: 88000000, rate: 0.24, deduction: 5760000 },
        { min: 88000000, max: 150000000, rate: 0.35, deduction: 15440000 },
        { min: 150000000, max: 300000000, rate: 0.38, deduction: 19440000 },
        { min: 300000000, max: 500000000, rate: 0.40, deduction: 25940000 },
        { min: 500000000, max: 1000000000, rate: 0.42, deduction: 35940000 },
        { min: 1000000000, max: Infinity, rate: 0.45, deduction: 65940000 }
    ],
    
    // 법인세율 (2025년 기준 - 영리법인 각사업연도소득 기준)
    corporate: [
        { min: 0, max: 200000000, rate: 0.09, deduction: 0 },
        { min: 200000000, max: 20000000000, rate: 0.19, deduction: 20000000 },
        { min: 20000000000, max: 300000000000, rate: 0.21, deduction: 420000000 },
        { min: 300000000000, max: Infinity, rate: 0.24, deduction: 9420000000 }
    ]
};

const DEDUCTIONS = {
    // 인적공제 (기본공제 + 추가공제)
    personal: 1500000,  // 본인
    dependent: 1500000, // 부양가족 1인당
    
    // 표준공제
    standard: 130000,
    
    // 특별세액공제 (실제로는 개인별로 다름)
    special: {
        insurance: 120000,      // 보험료세액공제 (연 12만원)
        medical: 150000,        // 의료비세액공제 (연 15만원 가정)
        education: 300000,      // 교육비세액공제 (연 30만원 가정)
        donation: 100000        // 기부금세액공제 (연 10만원 가정)
    },
    
    // 근로소득세액공제 한도
    earnedIncomeCredit: {
        max: 660000,
        rate: 0.55  // 산출세액의 55%
    },
    
    // 연금계좌세액공제
    pensionCredit: 1080000,
    
    // 자녀세액공제
    childCredit: 150000,
    
    // 배당세액공제율
    dividendCreditRate: 0.05  // 5% (2천만원 초과분)
};

// 전역 변수
let calculationResults = {};
let additionalPersonsCount = 0; // 추가 인원 수
let equityRatios = [100]; // 지분율 배열 [본인, 추가1, 추가2, 추가3]

// 페이지 로드 시 초기화 (중복 제거를 위해 아래 이벤트 리스너에서 처리)

// 기본값 설정 - 더 현실적이고 전략적인 케이스 제공
function setDefaultValues() {
    // 총처분 가능 금액 기본값 설정
    const totalAmountInput = document.getElementById('total-amount');
    if (!totalAmountInput.value) {
        totalAmountInput.value = formatNumberWithCommas(150000000);
    }
    
    // 총처분 가능 금액에 맞춰 비율 조정
    const totalAmount = getTotalAmount();
    
    // 더 현실적인 케이스 설정
    const strategicCases = [
        { 
            name: "급여 중심",
            salary: 0.87,     // 87%를 급여로 
            dividend: 0.13    // 13%를 배당으로 (최소 배당 활용)
        },
        { 
            name: "혼합 1",
            salary: 0.70,     // 70%를 급여로
            dividend: 0.30    // 30%를 배당으로
        },
        { 
            name: "혼합 2", 
            salary: 0.50,     // 50%를 급여로
            dividend: 0.50    // 50%를 배당으로 (균형)
        },
        { 
            name: "혼합 3",
            salary: 0.30,     // 30%를 급여로 (최소 근로소득 확보)
            dividend: 0.70    // 70%를 배당으로
        },
        { 
            name: "배당 중심",
            salary: 0.20,     // 20%를 급여로 (최소한의 급여)
            dividend: 0.80    // 80%를 배당으로 (최대 배당 활용)
        }
    ];
    
    // 각 케이스별 초기값 설정
    for (let i = 0; i < strategicCases.length; i++) {
        const caseNum = i + 1;
        const caseData = strategicCases[i];
        
        // 본인 급여/배당 계산 (기본적으로 본인이 100% 수령)
        const mainSalary = Math.round(totalAmount * caseData.salary);
        const mainDividend = Math.round(totalAmount * caseData.dividend);
        
        // 입력 필드에 값 설정
        document.getElementById(`case${caseNum}-salary`).value = formatNumberWithCommas(mainSalary);
        document.getElementById(`case${caseNum}-dividend`).value = formatNumberWithCommas(mainDividend);
    }
    
    // 케이스별 설명 업데이트
    updateCaseDescriptions();
    updateAllCaseTotals();
}

// 케이스별 설명 업데이트 함수 추가
function updateCaseDescriptions() {
    const caseHeaders = document.querySelectorAll('.case-header');
    const descriptions = [
        '급여 중심<br><span class="case-subtitle">급여 87% + 배당 13%</span>',
        '혼합 1<br><span class="case-subtitle">급여 70% + 배당 30%</span>',
        '혼합 2<br><span class="case-subtitle">급여 50% + 배당 50%</span>',
        '혼합 3<br><span class="case-subtitle">급여 30% + 배당 70%</span>',
        '배당 중심<br><span class="case-subtitle">급여 20% + 배당 80%</span>'
    ];
    
    caseHeaders.forEach((header, index) => {
        if (index > 0) { // 첫 번째는 "구분" 헤더이므로 제외
            header.innerHTML = `CASE ${index}<br><span class="case-subtitle">${descriptions[index-1].split('<br>')[1]}</span>`;
        }
    });
}

// 총처분 가능 금액 가져오기
function getTotalAmount() {
    const totalAmountInput = document.getElementById('total-amount');
    return parseNumberFromInput(totalAmountInput.value) || 150000000; // 기본값 1.5억
}

// 케이스별 총 금액 업데이트 (지분율 기반)
function updateCaseTotal(caseNumber) {
    // 본인 급여 + 배당
    const mainSalary = parseNumberFromInput(document.getElementById(`case${caseNumber}-salary`).value);
    const mainDividend = parseNumberFromInput(document.getElementById(`case${caseNumber}-dividend`).value);
    
    // 추가 인원들 급여 + 배당
    let additionalTotal = 0;
    for (let i = 0; i < additionalPersonsCount; i++) {
        const personNum = i + 1;
        const personSalaryElement = document.getElementById(`case${caseNumber}-salary-additional${personNum}`);
        const personDividendElement = document.getElementById(`case${caseNumber}-dividend-additional${personNum}`);
        
        if (personSalaryElement && personDividendElement) {
            const personSalary = parseNumberFromInput(personSalaryElement.value);
            const personDividend = parseNumberFromInput(personDividendElement.value);
            additionalTotal += personSalary + personDividend;
        }
    }
    
    // 전체 총합
    const caseTotal = mainSalary + mainDividend + additionalTotal;
    
    document.getElementById(`case${caseNumber}-total`).textContent = formatNumberWithCommas(caseTotal);
}

// 모든 케이스의 총 금액 업데이트
function updateAllCaseTotals() {
    for (let i = 1; i <= 5; i++) {
        updateCaseTotal(i);
    }
}

// 총처분 가능 금액 변경 시 모든 케이스 업데이트
function updateAllCasesFromTotal() {
    const totalAmount = getTotalAmount();
    
    for (let i = 1; i <= 5; i++) {
        const salaryInput = document.getElementById(`case${i}-salary`);
        const dividendInput = document.getElementById(`case${i}-dividend`);
        
        const currentSalary = parseNumberFromInput(salaryInput.value);
        const currentDividend = parseNumberFromInput(dividendInput.value);
        const currentTotal = currentSalary + currentDividend;
        
        // 현재 비율 유지하며 총액에 맞춰 조정
        if (currentTotal > 0) {
            const salaryRatio = currentSalary / currentTotal;
            const newSalary = Math.round(totalAmount * salaryRatio);
            const newDividend = totalAmount - newSalary;
            
            salaryInput.value = formatNumberWithCommas(newSalary);
            dividendInput.value = formatNumberWithCommas(newDividend);
        } else {
            // 기본값 설정
            const defaultValues = [
                { salary: 130000000, dividend: 0 },
                { salary: 110000000, dividend: 20000000 },
                { salary: 90000000, dividend: 40000000 },
                { salary: 70000000, dividend: 60000000 },
                { salary: 60000000, dividend: 70000000 }
            ];
            
            const defaultRatio = defaultValues[i-1];
            const defaultTotal = defaultRatio.salary + defaultRatio.dividend;
            const salaryRatio = defaultRatio.salary / defaultTotal;
            
            const newSalary = Math.round(totalAmount * salaryRatio);
            const newDividend = totalAmount - newSalary;
            
            salaryInput.value = formatNumberWithCommas(newSalary);
            dividendInput.value = formatNumberWithCommas(newDividend);
        }
    }
    
    updateAllCaseTotals();
}

// 케이스별 총액 업데이트 (자동 조정 기능 제거)
function updateCaseAmounts(caseNumber, changedField) {
    updateCaseTotal(caseNumber);
    checkTotalAmountStatus(caseNumber);
}

// 상세 분석 탭 전환
function showDetail(detailId) {
    // 모든 탭 비활성화
    document.querySelectorAll('.detail-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelectorAll('.detail-tabs .tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // 선택된 탭 활성화
    document.getElementById(detailId).classList.add('active');
    event.target.classList.add('active');
}

/**
 * 근로소득공제 계산 (2025년 기준)
 * 
 * 계산방법:
 * - 500만원 이하: 총급여액 × 70%
 * - 500만원 초과 ~ 1,500만원 이하: 총급여액 × 40% + 150만원
 * - 1,500만원 초과 ~ 4,500만원 이하: 총급여액 × 15% + 525만원  
 * - 4,500만원 초과 ~ 1억원 이하: 총급여액 × 5% + 975만원
 * - 1억원 초과: 총급여액 × 2% + 1,275만원
 * 
 * 단, 근로소득공제액은 총급여액을 초과할 수 없음
 * 
 * @param {number} totalSalary - 연간 총급여액
 * @returns {object} - 공제액과 계산 설명이 포함된 객체
 */
function calculateEarnedIncomeDeduction(totalSalary) {
    // 입력값 검증
    if (isNaN(totalSalary) || totalSalary <= 0) {
        return {
            amount: 0,
            explanation: '급여액 0원: 근로소득공제 없음'
        };
    }
    
    let deduction, explanation;
    
    if (totalSalary <= 5000000) {
        deduction = Math.min(totalSalary * 0.7, totalSalary);
        explanation = `500만원 이하: ${formatCurrency(totalSalary)} × 70%`;
    } else if (totalSalary <= 15000000) {
        deduction = Math.min(totalSalary * 0.4 + 1500000, totalSalary);
        explanation = `1,500만원 이하: ${formatCurrency(totalSalary)} × 40% + 150만원`;
    } else if (totalSalary <= 45000000) {
        deduction = Math.min(totalSalary * 0.15 + 5250000, totalSalary);
        explanation = `4,500만원 이하: ${formatCurrency(totalSalary)} × 15% + 525만원`;
    } else if (totalSalary <= 100000000) {
        deduction = Math.min(totalSalary * 0.05 + 9750000, totalSalary);
        explanation = `1억원 이하: ${formatCurrency(totalSalary)} × 5% + 975만원`;
    } else {
        deduction = Math.min(totalSalary * 0.02 + 12750000, totalSalary);
        explanation = `1억원 초과: ${formatCurrency(totalSalary)} × 2% + 1,275만원`;
    }
    
    return {
        amount: deduction,
        explanation: explanation
    };
}

// 2025년 기준 4대보험료 요율 및 상한액
const SOCIAL_INSURANCE_2025 = {
    nationalPension: {
        employeeRate: 0.045,    // 근로자 4.5%
        employerRate: 0.045,    // 사업주 4.5%
        maxIncome: 68880000     // 상한액: 월 574만원 * 12개월
    },
    healthInsurance: {
        rate: 0.0355,           // 3.55% (평균)
        longTermCareRate: 0.1295 // 장기요양보험: 건강보험료의 12.95%
    },
    employmentInsurance: {
        employeeRate: 0.009,    // 근로자 0.9%
        employerRate: 0.009     // 사업주 0.9%
    },
    workersCompensation: {
        employerRate: 0.007     // 산재보험: 사업주만 부담, 평균 0.7%
    }
};

/**
 * 4대보험료 계산 - 근로자 부담분 (2025년 기준)
 * 
 * 계산방법:
 * 1. 국민연금: 급여 × 4.5% (월 574만원, 연 6,888만원 상한)
 * 2. 건강보험: 급여 × 3.55% (평균 요율)
 * 3. 장기요양보험: 건강보험료 × 12.95%
 * 4. 고용보험: 급여 × 0.9%
 * 
 * 총 부담률: 약 9.0% (국민연금 상한 미적용 시)
 * 
 * @param {number} totalSalary - 연간 총급여액
 * @returns {object} - 각 보험료별 금액과 총액, 계산 설명이 포함된 객체
 */
function calculateSocialInsurance(totalSalary) {
    // 입력값 검증
    if (isNaN(totalSalary) || totalSalary <= 0) {
        return {
            nationalPension: 0,
            healthInsurance: 0,
            longTermCare: 0,
            employment: 0,
            total: 0,
            explanation: '급여액 0원: 4대보험료 없음',
            breakdown: '국민연금: 0원, 건강보험: 0원, 장기요양: 0원, 고용보험: 0원'
        };
    }
    
    const pension = SOCIAL_INSURANCE_2025.nationalPension;
    const health = SOCIAL_INSURANCE_2025.healthInsurance;
    const employment = SOCIAL_INSURANCE_2025.employmentInsurance;
    
    // 국민연금: 상한액 적용 (월 574만원 → 연 6,888만원)
    const pensionableIncome = Math.min(totalSalary, pension.maxIncome);
    const nationalPensionFee = pensionableIncome * pension.employeeRate;
    
    // 건강보험료 (평균 요율 3.55%)
    const healthInsuranceFee = totalSalary * health.rate;
    
    // 장기요양보험료 (건강보험료의 12.95%)
    const longTermCareFee = healthInsuranceFee * health.longTermCareRate;
    
    // 고용보험료 (0.9%)
    const employmentInsuranceFee = totalSalary * employment.employeeRate;
    
    const total = nationalPensionFee + healthInsuranceFee + longTermCareFee + employmentInsuranceFee;
    
    // 계산 설명
    const pensionExplanation = pensionableIncome < totalSalary 
        ? `국민연금: ${formatCurrency(pensionableIncome)}(상한) × 4.5%` 
        : `국민연금: ${formatCurrency(totalSalary)} × 4.5%`;
    
    const explanation = `${pensionExplanation} + 건강보험: ${formatCurrency(totalSalary)} × 3.55% + 장기요양: 건강보험료 × 12.95% + 고용보험: ${formatCurrency(totalSalary)} × 0.9%`;
    
    return {
        nationalPension: nationalPensionFee,
        healthInsurance: healthInsuranceFee,
        longTermCare: longTermCareFee,
        employment: employmentInsuranceFee,
        total: total,
        explanation: explanation,
        breakdown: `국민연금: ${formatCurrency(nationalPensionFee)}, 건강보험: ${formatCurrency(healthInsuranceFee)}, 장기요양: ${formatCurrency(longTermCareFee)}, 고용보험: ${formatCurrency(employmentInsuranceFee)}`
    };
}

/**
 * 회사부담 4대보험료 계산 - 법인세 절감 효과 계산용 (2025년 기준)
 * 
 * 계산방법:
 * 1. 국민연금: 급여 × 4.5% (근로자와 동일, 월 574만원 상한)
 * 2. 건강보험: 급여 × 3.55% (근로자와 동일)
 * 3. 장기요양보험: 건강보험료 × 12.95% (근로자와 동일) 
 * 4. 고용보험: 급여 × 0.9% (근로자와 동일)
 * 5. 산재보험: 급여 × 0.7% (회사만 부담, 업종별 차이 있음)
 * 
 * 회사 총 부담률: 약 9.7% (국민연금 상한 미적용 시)
 * 
 * @param {number} totalSalary - 연간 총급여액
 * @returns {object} - 회사부담 4대보험료 총액과 계산 설명이 포함된 객체
 */
function calculateCompanySocialInsurance(totalSalary) {
    const pension = SOCIAL_INSURANCE_2025.nationalPension;
    const health = SOCIAL_INSURANCE_2025.healthInsurance;
    const employment = SOCIAL_INSURANCE_2025.employmentInsurance;
    const workers = SOCIAL_INSURANCE_2025.workersCompensation;
    
    // 국민연금: 상한액 적용
    const pensionableIncome = Math.min(totalSalary, pension.maxIncome);
    const companyNationalPension = pensionableIncome * pension.employerRate;
    
    // 건강보험료 (회사 부담분)
    const companyHealthInsurance = totalSalary * health.rate;
    
    // 장기요양보험료 (회사 부담분)
    const companyLongTermCare = companyHealthInsurance * health.longTermCareRate;
    
    // 고용보험료 (회사 부담분)
    const companyEmploymentInsurance = totalSalary * employment.employerRate;
    
    // 산재보험료 (회사만 부담)
    const workersCompensationFee = totalSalary * workers.employerRate;
    
    const total = companyNationalPension + companyHealthInsurance + companyLongTermCare + 
           companyEmploymentInsurance + workersCompensationFee;
    
    // 계산 설명
    const pensionExplanation = pensionableIncome < totalSalary 
        ? `국민연금: ${formatCurrency(pensionableIncome)}(상한) × 4.5%` 
        : `국민연금: ${formatCurrency(totalSalary)} × 4.5%`;
    
    const explanation = `${pensionExplanation} + 건강보험: ${formatCurrency(totalSalary)} × 3.55% + 장기요양: 건강보험료 × 12.95% + 고용보험: ${formatCurrency(totalSalary)} × 0.9% + 산재보험: ${formatCurrency(totalSalary)} × 0.7%`;
    
    return {
        amount: total,
        explanation: explanation
    };
}

/**
 * 배당소득 Gross-up 계산 (2025년 기준)
 * 
 * 계산방법:
 * - 2천만원 이하: 배당소득 × 11% (법인세율 11%를 의제로 추가)
 * - 2천만원 초과: 2천만원까지만 11% 적용, 초과분은 Gross-up 없음
 * 
 * 목적: 배당소득에 대해 법인세를 이미 납부한 것으로 의제하여
 *       개인소득세와 법인세 간 이중과세 조정
 * 
 * @param {number} dividendIncome - 연간 배당소득
 * @returns {object} - Gross-up 금액과 계산 설명이 포함된 객체
 */
function calculateDividendGrossUp(dividendIncome) {
    // 입력값 검증
    if (isNaN(dividendIncome) || dividendIncome <= 0) {
        return {
            amount: 0,
            explanation: '배당소득 0원: Gross-up 없음'
        };
    }
    
    let grossUp, explanation;
    
    if (dividendIncome <= 20000000) {
        // 2천만원 이하: 배당소득의 11% gross-up
        grossUp = dividendIncome * 0.11;
        explanation = `배당소득 2천만원 이하: ${formatCurrency(dividendIncome)} × 11%`;
    } else {
        // 2천만원 초과: 2천만원까지는 11%, 초과분은 없음
        grossUp = 20000000 * 0.11;
        explanation = `배당소득 2천만원 초과: 2천만원 × 11% (초과분은 Gross-up 없음)`;
    }
    
    return {
        amount: grossUp,
        explanation: explanation
    };
}

/**
 * 배당세액공제 계산 (2025년 기준)
 * 
 * 계산방법:
 * - 2천만원 이하: (배당소득 + Gross-up) × 16.5%
 * - 2천만원 초과: 
 *   ∙ 2천만원까지: (2천만원 + Gross-up) × 16.5%
 *   ∙ 초과분: 초과 배당소득 × 5%
 * 
 * 목적: 법인세와 개인소득세 간 이중과세 방지
 *       16.5%는 법인세율(11%) + 지방소득세(1.1%) + 조정률
 *       5%는 초과분에 대한 최소 공제율
 * 
 * @param {number} dividendIncome - 연간 배당소득
 * @param {number} grossUp - 배당소득 Gross-up 금액
 * @returns {object} - 배당세액공제 금액과 계산 설명이 포함된 객체
 */
function calculateDividendCredit(dividendIncome, grossUp) {
    // 입력값 검증
    if (isNaN(dividendIncome) || dividendIncome <= 0) {
        return {
            amount: 0,
            explanation: '배당소득 0원: 배당세액공제 없음'
        };
    }
    
    // grossUp 검증
    if (isNaN(grossUp)) grossUp = 0;
    
    let totalCredit = 0;
    let explanation = '';
    
    if (dividendIncome <= 20000000) {
        // 2천만원 이하: 배당소득금액의 16.5% + gross-up의 16.5%
        totalCredit = (dividendIncome + grossUp) * 0.165;
        explanation = `배당소득 2천만원 이하: (${formatCurrency(dividendIncome)} + ${formatCurrency(grossUp)}) × 16.5%`;
    } else {
        // 2천만원 초과분이 있는 경우
        const under20M = 20000000;
        const over20M = dividendIncome - 20000000;
        
        // 2천만원까지: 배당소득의 16.5% + gross-up의 16.5%
        const creditUnder20M = (under20M + (under20M * 0.11)) * 0.165;
        
        // 2천만원 초과분: 배당소득의 5%만 공제 (gross-up 없음)
        const creditOver20M = over20M * 0.05;
        
        totalCredit = creditUnder20M + creditOver20M;
        explanation = `2천만원까지: (2천만원 + ${formatCurrency(under20M * 0.11)}) × 16.5% + 초과분: ${formatCurrency(over20M)} × 5%`;
    }
    
    return {
        amount: totalCredit,
        explanation: explanation
    };
}

/**
 * 종합소득세 산출 (2025년 기준 누진세율)
 * 
 * 과세표준별 세율:
 * - 1,400만원 이하: 6%
 * - 1,400만원 초과 ~ 5,000만원: 15%
 * - 5,000만원 초과 ~ 8,800만원: 24%
 * - 8,800만원 초과 ~ 1.5억원: 35%
 * - 1.5억원 초과 ~ 3억원: 38%
 * - 3억원 초과 ~ 5억원: 40%
 * - 5억원 초과 ~ 10억원: 42%
 * - 10억원 초과: 45%
 * 
 * @param {number} taxableIncome - 과세표준
 * @returns {number} - 산출세액
 */
function calculateIncomeTax(taxableIncome) {
    // 입력값 검증
    if (isNaN(taxableIncome) || taxableIncome <= 0) {
        return 0;
    }
    
    for (let bracket of TAX_RATES.income) {
        if (taxableIncome > bracket.min && taxableIncome <= bracket.max) {
            const tax = taxableIncome * bracket.rate - bracket.deduction;
            return Math.max(tax, 0); // 음수가 되지 않도록 보장
        }
    }
    return 0;
}

/**
 * 법인세 산출 (2025년 기준 영리법인 각사업연도소득 기준)
 * 
 * 소득구간별 세율:
 * - 2억원 이하: 9%
 * - 2억원 초과 ~ 200억원: 19%
 * - 200억원 초과 ~ 3,000억원: 21%
 * - 3,000억원 초과: 24%
 * 
 * 목적: 급여 지급으로 인한 법인세 절감 효과 계산
 * 
 * @param {number} corporateIncome - 법인소득
 * @returns {number} - 법인세액
 */
function calculateCorporateTax(corporateIncome) {
    // 입력값 검증
    if (isNaN(corporateIncome) || corporateIncome <= 0) {
        return 0;
    }
    
    for (let bracket of TAX_RATES.corporate) {
        if (corporateIncome > bracket.min && corporateIncome <= bracket.max) {
            const tax = corporateIncome * bracket.rate - bracket.deduction;
            return Math.max(tax, 0); // 음수가 되지 않도록 보장
        }
    }
    return 0;
}

/**
 * 근로소득세액공제 계산 (2025년 기준)
 * 
 * 계산방법:
 * - 기본: 산출세액 × 55%
 * - 급여별 한도:
 *   ∙ 3,300만원 이하: 74만원
 *   ∙ 3,300만원 초과 ~ 7,000만원: 66만원  
 *   ∙ 7,000만원 초과 ~ 1.2억원: 50만원
 *   ∙ 1.2억원 초과: 20만원
 * 
 * 목적: 근로자의 세부담 경감
 * 
 * @param {number} calculatedTax - 산출세액
 * @param {number} totalSalary - 연간 총급여액
 * @returns {number} - 근로소득세액공제 금액
 */
function calculateEarnedIncomeTaxCredit(calculatedTax, totalSalary) {
    // 산출세액의 55%를 공제하되, 급여수준에 따른 한도 적용
    let creditRate = 0.55;
    let maxCredit;
    
    // 2025년 기준 근로소득세액공제 한도
    if (totalSalary <= 33000000) {
        maxCredit = 740000;
    } else if (totalSalary <= 70000000) {
        maxCredit = 660000;
    } else if (totalSalary <= 120000000) {
        maxCredit = 500000;
    } else {
        maxCredit = 200000;
    }
    
    return Math.min(calculatedTax * creditRate, maxCredit);
}

/**
 * 종합소득공제 계산 (2025년 기준)
 * 
 * 구성요소:
 * 1. 인적공제: 본인 150만원 + 부양가족 × 150만원
 * 2. 연금보험료공제: 4대보험료 납부액 전액
 * 3. 신용카드등 사용금액 공제: (사용액 - 급여×25%) × 20% (최대 300만원)
 * 4. 주택자금공제: 월세 750만원 한도 (단순화)
 * 
 * @param {number} earnedIncome - 근로소득금액
 * @param {number} socialInsurance - 4대보험료 납부액
 * @param {number} familyCount - 부양가족 수 (본인 포함)
 * @param {string} deductionType - 공제 유형
 * @returns {object} - 총 소득공제 금액과 계산 설명이 포함된 객체
 */
function calculateTotalDeductions(earnedIncome, socialInsurance, familyCount, deductionType) {
    // 인적공제
    const personalDeduction = DEDUCTIONS.personal + (familyCount - 1) * DEDUCTIONS.dependent;
    
    // 연금보험료공제 (4대보험료)
    const pensionDeduction = socialInsurance;
    
    // 신용카드 등 사용금액 소득공제 (간소화)
    // 급여의 25% 초과분의 20% 공제 (최대 300만원)
    const creditCardThreshold = earnedIncome * 0.25;
    const estimatedCreditCardUsage = Math.min(earnedIncome * 0.3, 30000000); // 급여의 30% 또는 3천만원 중 적은 금액
    const creditCardDeduction = Math.max(0, Math.min((estimatedCreditCardUsage - creditCardThreshold) * 0.2, 3000000));
    
    // 주택자금공제 (단순화 - 월세 750만원 한도)
    const housingDeduction = 7500000;
    
    // 기타소득공제 합계
    const otherDeductions = creditCardDeduction + housingDeduction;
    
    const total = personalDeduction + pensionDeduction + otherDeductions;
    
    // 계산 설명
    const explanation = `인적공제: ${formatCurrency(personalDeduction)} + 연금보험료공제: ${formatCurrency(pensionDeduction)} + 신용카드공제: ${formatCurrency(creditCardDeduction)} + 주택자금공제: ${formatCurrency(housingDeduction)}`;
    
    return {
        amount: total,
        explanation: explanation
    };
}

/**
 * 특별세액공제 vs 표준세액공제 중 유리한 것 자동 선택 (2025년 기준)
 * 
 * 특별세액공제:
 * - 보험료세액공제: 12만원 (예시)
 * - 의료비세액공제: 15만원 (예시)
 * - 교육비세액공제: 30만원 (예시)
 * - 기부금세액공제: 10만원 (예시)
 * 
 * 표준세액공제: 13만원
 * 
 * 둘 중 유리한 것을 자동으로 선택하여 적용
 * 
 * @param {string} deductionType - 공제 유형 (현재 미사용)
 * @returns {object} - 세액공제 금액과 계산 설명이 포함된 객체
 */
function calculateTaxCredit(deductionType) {
    // 특별세액공제 계산
    const specialCredit = DEDUCTIONS.special.insurance + DEDUCTIONS.special.medical + 
                         DEDUCTIONS.special.education + DEDUCTIONS.special.donation;
    
    // 표준세액공제
    const standardCredit = DEDUCTIONS.standard;
    
    let amount, explanation;
    
    if (specialCredit > standardCredit) {
        amount = specialCredit;
        explanation = `특별세액공제: 보험료 ${formatCurrency(DEDUCTIONS.special.insurance)} + 의료비 ${formatCurrency(DEDUCTIONS.special.medical)} + 교육비 ${formatCurrency(DEDUCTIONS.special.education)} + 기부금 ${formatCurrency(DEDUCTIONS.special.donation)} (표준세액공제보다 유리)`;
    } else {
        amount = standardCredit;
        explanation = `표준세액공제: ${formatCurrency(standardCredit)} (특별세액공제 ${formatCurrency(specialCredit)}보다 유리)`;
    }
    
    return {
        amount: amount,
        explanation: explanation
    };
}

// 단일 케이스 세금 계산
function calculateSingleCase(salary, dividend, familyCount, deductionType) {
    const result = {};
    
    // 1. 근로소득 계산
    result.totalSalary = salary;
    const earnedIncomeDeductionDetail = calculateEarnedIncomeDeduction(salary);
    result.earnedIncomeDeduction = earnedIncomeDeductionDetail.amount;
    result.earnedIncomeDeductionExplanation = earnedIncomeDeductionDetail.explanation;
    result.earnedIncome = salary - result.earnedIncomeDeduction;
    
    const socialInsuranceDetail = calculateSocialInsurance(salary);
    result.socialInsurance = socialInsuranceDetail.total;
    result.socialInsuranceExplanation = socialInsuranceDetail.explanation;
    result.socialInsuranceBreakdown = socialInsuranceDetail.breakdown;
    
    // 2. 배당소득 계산
    result.dividendIncome = dividend;
    const grossUpDetail = calculateDividendGrossUp(dividend);
    result.grossUp = grossUpDetail.amount;
    result.grossUpExplanation = grossUpDetail.explanation;
    
    // 3. 종합소득 계산
    result.totalIncome = result.earnedIncome + result.dividendIncome + result.grossUp;
    
    // 4. 종합소득공제
    const totalDeductionsDetail = calculateTotalDeductions(
        result.earnedIncome, 
        result.socialInsurance, 
        familyCount, 
        deductionType
    );
    result.totalDeductions = totalDeductionsDetail.amount;
    result.totalDeductionsExplanation = totalDeductionsDetail.explanation;
    
    // 5. 과세표준
    result.taxableIncome = Math.max(result.totalIncome - result.totalDeductions, 0);
    
    // 6. 산출세액
    result.calculatedTax = calculateIncomeTax(result.taxableIncome);
    
    // 7. 세액공제
    const dividendCreditDetail = calculateDividendCredit(result.dividendIncome, result.grossUp);
    result.dividendCredit = dividendCreditDetail.amount;
    result.dividendCreditExplanation = dividendCreditDetail.explanation;
    result.earnedIncomeTaxCredit = calculateEarnedIncomeTaxCredit(result.calculatedTax, salary);
    const taxCreditDetail = calculateTaxCredit(deductionType);
    result.taxCredit = taxCreditDetail.amount;
    result.taxCreditExplanation = taxCreditDetail.explanation;
    result.additionalCredits = DEDUCTIONS.pensionCredit + DEDUCTIONS.childCredit;
    
    // 8. 결정세액
    const totalCredits = result.dividendCredit + result.earnedIncomeTaxCredit + 
                        result.taxCredit + result.additionalCredits;
    result.finalTax = Math.max(result.calculatedTax - totalCredits, 0);
    
    // 9. 법인세 절감효과 (급여는 비용공제, 배당은 세후지급)
    // 급여 + 회사부담 4대보험료 지급으로 인한 법인소득 감소분에 대한 법인세 절감
    const companySocialInsuranceDetail = calculateCompanySocialInsurance(salary);
    const totalLaborCost = salary + companySocialInsuranceDetail.amount;
    result.corporateTaxSaving = calculateCorporateTax(totalLaborCost);
    result.companySocialInsurance = companySocialInsuranceDetail.amount;
    result.companySocialInsuranceExplanation = companySocialInsuranceDetail.explanation;
    
    // 10. 총 개인부담액 (개인소득세 + 4대보험료)
    result.totalPersonalBurden = result.finalTax + result.socialInsurance;
    
    // 11. 순 세금효과 (총 개인부담액 - 법인세절감)
    result.netTaxEffect = result.totalPersonalBurden - result.corporateTaxSaving;
    
    return result;
}

// 추가 인원 입력 필드에 이벤트 리스너 추가
function addEventListenersToAdditionalPersonInputs(personId) {
    for (let caseNum = 1; caseNum <= 5; caseNum++) {
        const salaryInput = document.getElementById(`case${caseNum}-salary-person${personId}`);
        const dividendInput = document.getElementById(`case${caseNum}-dividend-person${personId}`);
        
        // 급여 입력 필드 이벤트 리스너
        if (salaryInput) {
            salaryInput.addEventListener('input', function(e) {
                formatCurrencyInput(e.target);
                handleAdditionalPersonInput(personId, 'salary', caseNum);
            });
            
            salaryInput.addEventListener('keydown', restrictToNumbers);
            
            salaryInput.addEventListener('paste', function(e) {
                setTimeout(() => {
                    formatCurrencyInput(e.target);
                    handleAdditionalPersonInput(personId, 'salary', caseNum);
                }, 0);
            });
            
            salaryInput.addEventListener('blur', function(e) {
                formatCurrencyInput(e.target);
            });
        }
        
        // 배당 입력 필드 이벤트 리스너
        if (dividendInput) {
            dividendInput.addEventListener('input', function(e) {
                formatCurrencyInput(e.target);
                handleAdditionalPersonInput(personId, 'dividend', caseNum);
            });
            
            dividendInput.addEventListener('keydown', restrictToNumbers);
            
            dividendInput.addEventListener('paste', function(e) {
                setTimeout(() => {
                    formatCurrencyInput(e.target);
                    handleAdditionalPersonInput(personId, 'dividend', caseNum);
                }, 0);
            });
            
            dividendInput.addEventListener('blur', function(e) {
                formatCurrencyInput(e.target);
            });
        }
    }
}

// 메인 계산 함수
function calculateTaxEffect() {
    try {
        // 입력값 수집
        const familyCount = 1; // 본인만 계산 (부양가족 없음)
        const deductionType = 'standard'; // 기본값으로 표준공제 사용
        
        // 각 케이스별 계산
        const cases = [];
        for (let i = 1; i <= 5; i++) {
            const salary = parseNumberFromInput(document.getElementById(`case${i}-salary`).value);
            const dividend = parseNumberFromInput(document.getElementById(`case${i}-dividend`).value);
            
            // 본인 계산
            const mainPersonResult = calculateSingleCase(salary, dividend, familyCount, deductionType);
            
            // 추가 인원들 계산
            let additionalPersonsResults = [];
            for (let j = 0; j < additionalPersonsCount; j++) {
                const personNum = j + 1;
                const personSalaryElement = document.getElementById(`case${i}-salary-additional${personNum}`);
                const personDividendElement = document.getElementById(`case${i}-dividend-additional${personNum}`);
                
                if (personSalaryElement && personDividendElement) {
                    const personSalary = parseNumberFromInput(personSalaryElement.value) || 0;
                    const personDividend = parseNumberFromInput(personDividendElement.value) || 0;
                    
                    if (personSalary > 0 || personDividend > 0) {
                        additionalPersonsResults.push(
                            calculateAdditionalPersonCase(personSalary, personDividend)
                        );
                    }
                }
            }
            
            // 전체 합계 계산 - 모든 세부 정보 포함
            const combinedResult = {
                // 기본 급여/배당 정보
                totalSalary: mainPersonResult.totalSalary,
                dividendIncome: mainPersonResult.dividendIncome,
                
                // 근로소득 관련 세부 정보
                earnedIncomeDeduction: mainPersonResult.earnedIncomeDeduction,
                earnedIncomeDeductionExplanation: mainPersonResult.earnedIncomeDeductionExplanation,
                earnedIncome: mainPersonResult.earnedIncome,
                
                // 4대보험료 관련 세부 정보
                socialInsurance: mainPersonResult.socialInsurance,
                socialInsuranceExplanation: mainPersonResult.socialInsuranceExplanation,
                socialInsuranceBreakdown: mainPersonResult.socialInsuranceBreakdown,
                companySocialInsurance: mainPersonResult.companySocialInsurance,
                companySocialInsuranceExplanation: mainPersonResult.companySocialInsuranceExplanation,
                
                // 배당소득 관련 세부 정보
                grossUp: mainPersonResult.grossUp,
                grossUpExplanation: mainPersonResult.grossUpExplanation,
                
                // 종합소득세 관련 세부 정보
                totalIncome: mainPersonResult.totalIncome,
                totalDeductions: mainPersonResult.totalDeductions,
                totalDeductionsExplanation: mainPersonResult.totalDeductionsExplanation,
                taxableIncome: mainPersonResult.taxableIncome,
                calculatedTax: mainPersonResult.calculatedTax,
                
                // 세액공제 관련 세부 정보
                dividendCredit: mainPersonResult.dividendCredit,
                dividendCreditExplanation: mainPersonResult.dividendCreditExplanation,
                earnedIncomeTaxCredit: mainPersonResult.earnedIncomeTaxCredit,
                taxCredit: mainPersonResult.taxCredit,
                taxCreditExplanation: mainPersonResult.taxCreditExplanation,
                additionalCredits: mainPersonResult.additionalCredits,
                
                // 최종 계산 결과
                finalTax: mainPersonResult.finalTax,
                totalPersonalBurden: mainPersonResult.totalPersonalBurden,
                corporateTaxSaving: mainPersonResult.corporateTaxSaving,
                netTaxEffect: mainPersonResult.netTaxEffect
            };
            
            // 추가 인원들 합산
            additionalPersonsResults.forEach(additionalResult => {
                combinedResult.finalTax += additionalResult.finalTax;
                combinedResult.socialInsurance += additionalResult.socialInsurance;
                combinedResult.totalPersonalBurden += additionalResult.totalPersonalBurden;
                combinedResult.corporateTaxSaving += additionalResult.corporateTaxSaving;
                combinedResult.netTaxEffect += additionalResult.netTaxEffect;
                
                // 전체 급여/배당 합계 (표시용)
                combinedResult.totalSalary += additionalResult.totalSalary;
                combinedResult.dividendIncome += additionalResult.dividendIncome;
            });
            
            cases.push(combinedResult);
        }
        
        // 결과 저장
        calculationResults = cases;
        
        // 결과 표시
        displayResults(cases);
        
        // 결과 섹션 표시
        document.getElementById('results-section').style.display = 'block';
        document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
        
    } catch (error) {
        console.error('계산 중 오류 발생:', error);
        alert('계산 중 오류가 발생했습니다. 입력값을 확인해주세요.');
    }
}

// 결과 표시
function displayResults(cases) {
    // 1. 요약 테이블 업데이트
    updateSummaryTable(cases);
    
    // 2. 상세 분석 업데이트
    updateDetailedAnalysis(cases);
    
    // 3. 최적 추천 업데이트
    updateRecommendation(cases);
    
    // 4. 가장 유리한 케이스를 기본으로 선택
    const bestCaseNumber = findBestCase(cases);
    activateDetailCase(bestCaseNumber);
    
    console.log(`가장 유리한 케이스: CASE ${bestCaseNumber}`);
}

// 요약 테이블 업데이트
function updateSummaryTable(cases) {
    // 기존 best-value 클래스 제거
    document.querySelectorAll('#summary-table .best-value').forEach(el => {
        el.classList.remove('best-value');
    });
    
    // 총 개인부담액과 실질부담총세금의 최소값 찾기
    let minPersonalBurden = Infinity;
    let minNetTaxEffect = Infinity;
    let minPersonalBurdenIndex = -1;
    let minNetTaxEffectIndex = -1;
    
    cases.forEach((caseResult, index) => {
        const caseNum = index + 1;
        
        // 기본 정보 업데이트
        document.getElementById(`summary-salary-${caseNum}`).textContent = 
            formatCurrency(caseResult.totalSalary);
        document.getElementById(`summary-dividend-${caseNum}`).textContent = 
            formatCurrency(caseResult.dividendIncome);
        document.getElementById(`summary-personal-tax-${caseNum}`).textContent = 
            formatCurrency(caseResult.finalTax);
        
        // 4대보험료: 개인부담분 + 회사부담분 총합 표시
        const totalSocialInsurance = caseResult.socialInsurance + caseResult.companySocialInsurance;
        const socialInsuranceElement = document.getElementById(`summary-social-insurance-${caseNum}`);
        socialInsuranceElement.textContent = formatCurrency(totalSocialInsurance);
        
        // 툴팁으로 세부내역 표시
        socialInsuranceElement.title = `총 4대보험료: ${formatCurrency(totalSocialInsurance)}\n개인부담분: ${formatCurrency(caseResult.socialInsurance)}\n회사부담분: ${formatCurrency(caseResult.companySocialInsurance)}`;
        
        document.getElementById(`summary-total-personal-burden-${caseNum}`).textContent = 
            formatCurrency(caseResult.totalPersonalBurden);
        document.getElementById(`summary-corp-saving-${caseNum}`).textContent = 
            formatCurrency(caseResult.corporateTaxSaving);
        document.getElementById(`summary-net-effect-${caseNum}`).textContent = 
            formatCurrency(caseResult.netTaxEffect);
        
        // 순 세금효과에 따른 색상 적용
        const netEffectElement = document.getElementById(`summary-net-effect-${caseNum}`);
        if (caseResult.netTaxEffect < 0) {
            netEffectElement.classList.add('positive');
            netEffectElement.classList.remove('negative');
        } else {
            netEffectElement.classList.add('negative');
            netEffectElement.classList.remove('positive');
        }
        
        // 최소값 찾기
        if (caseResult.totalPersonalBurden < minPersonalBurden) {
            minPersonalBurden = caseResult.totalPersonalBurden;
            minPersonalBurdenIndex = index;
        }
        
        if (caseResult.netTaxEffect < minNetTaxEffect) {
            minNetTaxEffect = caseResult.netTaxEffect;
            minNetTaxEffectIndex = index;
        }
    });
    
    // 최소값에 따봉 표시 추가
    if (minPersonalBurdenIndex !== -1) {
        const personalBurdenElement = document.getElementById(`summary-total-personal-burden-${minPersonalBurdenIndex + 1}`);
        personalBurdenElement.classList.add('best-value');
    }
    
    if (minNetTaxEffectIndex !== -1) {
        const netEffectElement = document.getElementById(`summary-net-effect-${minNetTaxEffectIndex + 1}`);
        netEffectElement.classList.add('best-value');
    }
}

// 상세 분석 업데이트
function updateDetailedAnalysis(cases) {
    cases.forEach((caseResult, index) => {
        const caseNum = index + 1;
        
        // 근로소득 관련
        document.getElementById(`detail${caseNum}-total-salary`).textContent = 
            formatCurrency(caseResult.totalSalary);
        document.getElementById(`detail${caseNum}-salary-deduction`).textContent = 
            formatCurrency(caseResult.earnedIncomeDeduction);
        document.getElementById(`detail${caseNum}-salary-income`).textContent = 
            formatCurrency(caseResult.earnedIncome);
        
        // 근로소득공제 설명 추가
        const salaryDeductionExplanation = document.getElementById(`detail${caseNum}-salary-deduction-explanation`);
        if (salaryDeductionExplanation) {
            salaryDeductionExplanation.textContent = caseResult.earnedIncomeDeductionExplanation;
        }
        
        // 4대보험료 관련
        document.getElementById(`detail${caseNum}-social-insurance`).textContent = 
            formatCurrency(caseResult.socialInsurance);
        document.getElementById(`detail${caseNum}-company-insurance`).textContent = 
            formatCurrency(caseResult.companySocialInsurance);
        
        // 4대보험료 설명 추가
        const socialInsuranceExplanation = document.getElementById(`detail${caseNum}-social-insurance-explanation`);
        if (socialInsuranceExplanation) {
            socialInsuranceExplanation.textContent = caseResult.socialInsuranceExplanation;
        }
        
        const companyInsuranceExplanation = document.getElementById(`detail${caseNum}-company-insurance-explanation`);
        if (companyInsuranceExplanation) {
            companyInsuranceExplanation.textContent = caseResult.companySocialInsuranceExplanation;
        }
        
        // 툴팁에 4대보험료 상세내역 추가
        const socialInsuranceElement = document.getElementById(`detail${caseNum}-social-insurance`);
        if (socialInsuranceElement) {
            socialInsuranceElement.title = caseResult.socialInsuranceBreakdown;
        }
        
        // 배당소득 관련
        document.getElementById(`detail${caseNum}-dividend-income`).textContent = 
            formatCurrency(caseResult.dividendIncome);
        document.getElementById(`detail${caseNum}-gross-up`).textContent = 
            formatCurrency(caseResult.grossUp);
        document.getElementById(`detail${caseNum}-dividend-credit`).textContent = 
            formatCurrency(caseResult.dividendCredit);
        
        // Gross-up 설명 추가
        const grossUpExplanation = document.getElementById(`detail${caseNum}-gross-up-explanation`);
        if (grossUpExplanation) {
            grossUpExplanation.textContent = caseResult.grossUpExplanation;
        }
        
        // 배당세액공제 설명 추가
        const dividendCreditExplanation = document.getElementById(`detail${caseNum}-dividend-credit-explanation`);
        if (dividendCreditExplanation) {
            dividendCreditExplanation.textContent = caseResult.dividendCreditExplanation;
        }
        
        // 종합소득세 관련
        document.getElementById(`detail${caseNum}-total-income`).textContent = 
            formatCurrency(caseResult.totalIncome);
        document.getElementById(`detail${caseNum}-income-deduction`).textContent = 
            formatCurrency(caseResult.totalDeductions);
        document.getElementById(`detail${caseNum}-taxable-income`).textContent = 
            formatCurrency(caseResult.taxableIncome);
        document.getElementById(`detail${caseNum}-calculated-tax`).textContent = 
            formatCurrency(caseResult.calculatedTax);
        
        // 세액공제 항목별 상세 표시
        document.getElementById(`detail${caseNum}-dividend-tax-credit`).textContent = 
            formatCurrency(caseResult.dividendCredit);
        document.getElementById(`detail${caseNum}-earned-income-tax-credit`).textContent = 
            formatCurrency(caseResult.earnedIncomeTaxCredit);
        document.getElementById(`detail${caseNum}-standard-tax-credit`).textContent = 
            formatCurrency(caseResult.taxCredit);
        document.getElementById(`detail${caseNum}-pension-tax-credit`).textContent = 
            formatCurrency(DEDUCTIONS.pensionCredit);
        document.getElementById(`detail${caseNum}-child-tax-credit`).textContent = 
            formatCurrency(DEDUCTIONS.childCredit);
        
        // 총 세액공제
        const totalCredits = caseResult.dividendCredit + caseResult.earnedIncomeTaxCredit + 
                            caseResult.taxCredit + DEDUCTIONS.pensionCredit + DEDUCTIONS.childCredit;
        document.getElementById(`detail${caseNum}-total-tax-credit`).textContent = 
            formatCurrency(totalCredits);
        
        document.getElementById(`detail${caseNum}-final-tax`).textContent = 
            formatCurrency(caseResult.finalTax);
            
        // 결정세액 요소에 총 개인부담액 정보를 툴팁으로 추가
        const finalTaxElement = document.getElementById(`detail${caseNum}-final-tax`);
        if (finalTaxElement) {
            finalTaxElement.title = `총 개인부담액: ${formatCurrency(caseResult.totalPersonalBurden)} (소득세: ${formatCurrency(caseResult.finalTax)} + 4대보험료: ${formatCurrency(caseResult.socialInsurance)})`;
        }
        
        // 소득공제 설명 추가
        const incomeDeductionExplanation = document.getElementById(`detail${caseNum}-income-deduction-explanation`);
        if (incomeDeductionExplanation) {
            incomeDeductionExplanation.textContent = caseResult.totalDeductionsExplanation;
        }
    });
}

// 최적 추천 업데이트
function updateRecommendation(cases) {
    // 순 세금효과가 가장 낮은(유리한) 케이스 찾기
    let bestCaseIndex = 0;
    let bestNetEffect = cases[0].netTaxEffect;
    
    cases.forEach((caseResult, index) => {
        if (caseResult.netTaxEffect < bestNetEffect) {
            bestNetEffect = caseResult.netTaxEffect;
            bestCaseIndex = index;
        }
    });
    
    const bestCase = cases[bestCaseIndex];
    const bestCaseNum = bestCaseIndex + 1;
    
    // 추천 내용 업데이트
    document.getElementById('best-case').textContent = `CASE ${bestCaseNum}이 가장 유리합니다`;
    
    let reason = '';
    if (bestNetEffect < 0) {
        reason = `이 방식으로 연간 약 ${formatCurrency(Math.abs(bestNetEffect))}의 총 부담액을 절약할 수 있습니다. (개인소득세 + 4대보험료 포함)`;
    } else {
        reason = `모든 케이스에서 추가 부담이 발생하지만, 이 케이스가 가장 부담이 적습니다.`;
    }
    document.getElementById('recommendation-reason').textContent = reason;
    
    document.getElementById('rec-salary').textContent = formatCurrency(bestCase.totalSalary);
    document.getElementById('rec-dividend').textContent = formatCurrency(bestCase.dividendIncome);
    document.getElementById('rec-savings').textContent = formatCurrency(Math.abs(bestNetEffect));
}

// 통화 형식 포맷터
function formatCurrency(amount) {
    // NaN, undefined, null 체크
    if (isNaN(amount) || amount == null) return '0원';
    if (amount === 0) return '0원';
    
    const absAmount = Math.abs(amount);
    let formatted;
    
    if (absAmount >= 100000000) {
        // 1억 이상
        formatted = (absAmount / 100000000).toFixed(1) + '억원';
    } else if (absAmount >= 10000) {
        // 1만 이상
        formatted = (absAmount / 10000).toFixed(0) + '만원';
    } else {
        // 1만 미만
        formatted = absAmount.toLocaleString() + '원';
    }
    
    return amount < 0 ? '-' + formatted : formatted;
}

// 숫자를 천단위 쉼표로 포맷팅
function formatNumberWithCommas(num) {
    // NaN, undefined, null 체크
    if (isNaN(num) || num == null) return '0';
    if (num === 0 || num === '0') return '0';
    if (!num) return '';
    
    // 숫자를 문자열로 변환하고 쉼표 추가
    return num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

// 입력값에서 쉼표 제거하고 숫자로 변환
function parseNumberFromInput(value) {
    if (!value) return 0;
    
    // 쉼표 제거하고 숫자만 추출
    const cleanValue = value.toString().replace(/[^0-9]/g, '');
    const result = parseInt(cleanValue) || 0;
    
    // NaN 체크
    return isNaN(result) ? 0 : result;
}

// 통화 입력 필드 포맷팅
function formatCurrencyInput(input) {
    const cursorPosition = input.selectionStart;
    const oldValue = input.value;
    const oldLength = oldValue.length;
    
    // 현재 값에서 숫자만 추출
    const numericValue = parseNumberFromInput(input.value);
    
    // 새로운 포맷팅된 값
    const newValue = formatNumberWithCommas(numericValue);
    
    // 값 업데이트
    input.value = newValue;
    
    // 커서 위치 조정 (쉼표 추가로 인한 위치 변화 고려)
    const newLength = newValue.length;
    const lengthDifference = newLength - oldLength;
    const newCursorPosition = Math.max(0, cursorPosition + lengthDifference);
    
    // 커서 위치 설정 (다음 프레임에서 실행)
    setTimeout(() => {
        input.setSelectionRange(newCursorPosition, newCursorPosition);
    }, 0);
}

// 숫자만 입력 허용 (붙여넣기 포함)
function restrictToNumbers(e) {
    // 특수 키는 허용 (백스페이스, 삭제, 화살표 등)
    if (e.key === 'Backspace' || e.key === 'Delete' || e.key === 'Tab' || 
        e.key === 'Escape' || e.key === 'Enter' || e.key === 'Home' || 
        e.key === 'End' || e.key.includes('Arrow')) {
        return true;
    }
    
    // Ctrl+A, Ctrl+C, Ctrl+V, Ctrl+X 허용
    if (e.ctrlKey && (e.key === 'a' || e.key === 'c' || e.key === 'v' || e.key === 'x')) {
        return true;
    }
    
    // 숫자가 아닌 경우 입력 방지
    if (!/[0-9]/.test(e.key)) {
        e.preventDefault();
        return false;
    }
    
    return true;
}

// 이벤트 리스너 등록
document.addEventListener('DOMContentLoaded', function() {
    // 기본값 설정
    setDefaultValues();
    
    // 총처분 가능 금액 입력 필드 이벤트 리스너
    const totalAmountInput = document.getElementById('total-amount');
    
    function handleTotalAmountChange() {
        formatCurrencyInput(totalAmountInput);
        updateAllCasesFromTotal();
    }
    
    totalAmountInput.addEventListener('input', handleTotalAmountChange);
    totalAmountInput.addEventListener('paste', function(e) {
        setTimeout(handleTotalAmountChange, 0);
    });
    totalAmountInput.addEventListener('blur', handleTotalAmountChange);
    totalAmountInput.addEventListener('keydown', restrictToNumbers);
    
    // 케이스별 급여액/배당액 입력 필드 이벤트 리스너
    for (let i = 1; i <= 5; i++) {
        const salaryInput = document.getElementById(`case${i}-salary`);
        const dividendInput = document.getElementById(`case${i}-dividend`);
        
        function handleSalaryChange() {
            formatCurrencyInput(salaryInput);
            updateCaseAmounts(i, 'salary');
        }
        
        function handleDividendChange() {
            formatCurrencyInput(dividendInput);
            updateCaseAmounts(i, 'dividend');
        }
        
        // 급여액 이벤트
        salaryInput.addEventListener('input', handleSalaryChange);
        salaryInput.addEventListener('paste', function(e) {
            setTimeout(handleSalaryChange, 0);
        });
        salaryInput.addEventListener('blur', handleSalaryChange);
        salaryInput.addEventListener('keydown', restrictToNumbers);
        
        // 배당액 이벤트
        dividendInput.addEventListener('input', handleDividendChange);
        dividendInput.addEventListener('paste', function(e) {
            setTimeout(handleDividendChange, 0);
        });
        dividendInput.addEventListener('blur', handleDividendChange);
        dividendInput.addEventListener('keydown', restrictToNumbers);
    }
    
    // 기타 currency-input 필드들 (총처분 가능 금액과 케이스별 필드 제외)
    const otherCurrencyInputs = document.querySelectorAll('.currency-input:not(#total-amount):not([id^="case"])');
    
    otherCurrencyInputs.forEach(input => {
        input.addEventListener('input', function(e) {
            formatCurrencyInput(e.target);
        });
        
        input.addEventListener('keydown', restrictToNumbers);
        
        input.addEventListener('paste', function(e) {
            setTimeout(() => {
                formatCurrencyInput(e.target);
            }, 0);
        });
        
        input.addEventListener('blur', function(e) {
            formatCurrencyInput(e.target);
        });
    });
    
    // 초기 총 금액 계산
    updateAllCaseTotals();
    
    // 본인 지분율 입력 필드 초기 설정
    setupEquityInputFocus(document.getElementById('equity-main'));
    
    console.log('지분율 입력 필드 초기화 완료');
});

// 엔터키로 계산 실행
document.addEventListener('keydown', function(e) {
    if (e.key === 'Enter') {
        const focusedElement = document.activeElement;
        if (focusedElement.tagName === 'INPUT') {
            calculateTaxEffect();
        }
    }
});

// ========== 지분율 기반 인원 관리 기능 ==========

// 추가 인원 수 변경 처리
function handleAdditionalPersonsChange() {
    const select = document.getElementById('additional-persons');
    const newCount = parseInt(select.value);
    
    additionalPersonsCount = newCount;
    
    // 지분율 배열 초기화
    equityRatios = [100]; // 본인은 기본 100%
    for (let i = 0; i < newCount; i++) {
        equityRatios.push(0); // 추가 인원들은 기본 0%
    }
    
    // 지분율 섹션 표시/숨김
    const equitySection = document.getElementById('equity-section');
    if (newCount > 0) {
        equitySection.style.display = 'block';
        updateEquityGrid();
    } else {
        equitySection.style.display = 'none';
    }
    
    // 시나리오 테이블 업데이트
    updateScenarioTable();
}

// 지분율 그리드 업데이트
function updateEquityGrid() {
    const equityGrid = document.getElementById('equity-grid');
    equityGrid.innerHTML = '';
    
    // 본인 지분율
    const mainEquityItem = document.createElement('div');
    mainEquityItem.className = 'equity-item';
    mainEquityItem.innerHTML = `
        <label for="equity-main">본인 지분율 (%)</label>
        <input type="number" id="equity-main" min="0" max="100" value="${equityRatios[0]}" onchange="handleEquityChange('equity-main')">
    `;
    equityGrid.appendChild(mainEquityItem);
    
    // 추가 인원들 지분율
    for (let i = 0; i < additionalPersonsCount; i++) {
        const equityItem = document.createElement('div');
        equityItem.className = 'equity-item';
        equityItem.innerHTML = `
            <label for="equity-additional-${i+1}">추가${i+1} 지분율 (%)</label>
            <input type="number" id="equity-additional-${i+1}" min="0" max="100" placeholder="0" onchange="handleEquityChange('equity-additional-${i+1}')">
        `;
        equityGrid.appendChild(equityItem);
    }
    
    // 지분율 입력 필드 이벤트 리스너 설정
    setupEquityInputListeners();
}

// 지분율 변경 처리
function handleEquityChange(changedInputId = null) {
    // 지분율 배열 업데이트
    for (let i = 0; i <= additionalPersonsCount; i++) {
        const equityInput = i === 0 ? 
            document.getElementById('equity-main') : 
            document.getElementById(`equity-additional-${i}`);
        
        if (equityInput) {
            equityRatios[i] = parseInt(equityInput.value) || 0;
        }
    }
    
    // 추가 인원의 지분율이 변경된 경우 본인 지분에서 차감
    if (changedInputId && changedInputId !== 'equity-main') {
        adjustMainEquityRatio();
    }
    
    // 총 지분율 계산 및 표시
    const totalEquity = equityRatios.reduce((sum, ratio) => sum + ratio, 0);
    const totalEquityElement = document.getElementById('total-equity');
    if (totalEquityElement) {
        totalEquityElement.textContent = totalEquity.toFixed(1);
    }
    
    // 시나리오 테이블 업데이트 (급여는 그대로 두고 배당만 재분배)
    updateScenarioTableForDividendOnly();
}

// 배당만 재분배하는 함수 (새로 추가)
function updateScenarioTableForDividendOnly() {
    const totalEquityRatio = equityRatios.reduce((sum, ratio) => sum + ratio, 0) / 100;
    
    if (totalEquityRatio === 0) return;
    
    for (let caseNum = 1; caseNum <= 5; caseNum++) {
        const mainSalary = parseNumberFromInput(document.getElementById(`case${caseNum}-salary`).value);
        const mainDividend = parseNumberFromInput(document.getElementById(`case${caseNum}-dividend`).value);
        
        // 현재 총 급여 (본인 + 추가 인원들)
        let totalCurrentSalary = mainSalary;
        for (let i = 0; i < additionalPersonsCount; i++) {
            const personNum = i + 1;
            const additionalSalaryElement = document.getElementById(`case${caseNum}-salary-additional${personNum}`);
            if (additionalSalaryElement) {
                totalCurrentSalary += parseNumberFromInput(additionalSalaryElement.value) || 0;
            }
        }
        
        // 총 처분 가능 금액에서 현재 총 급여를 뺀 나머지가 총 배당액
        const totalAmount = getTotalAmount();
        const totalDividendAmount = Math.max(0, totalAmount - totalCurrentSalary);
        
        // 추가 인원들의 배당 재분배 (지분율 기준)
        for (let i = 0; i < additionalPersonsCount; i++) {
            const personNum = i + 1;
            const additionalEquityRatio = equityRatios[personNum] / 100;
            
            // 추가 인원의 배당 = 총 배당액 × (추가 인원 지분율 / 전체 지분율)
            const additionalDividend = totalDividendAmount > 0 ? 
                Math.round(totalDividendAmount * (additionalEquityRatio / totalEquityRatio)) : 0;
            
            document.getElementById(`case${caseNum}-dividend-additional${personNum}`).value = 
                formatNumberWithCommas(additionalDividend);
        }
        
        // 본인의 배당 재계산 (지분율 기준)
        const mainEquityRatio = equityRatios[0] / 100;
        const mainAllocatedDividend = totalDividendAmount > 0 ? 
            Math.round(totalDividendAmount * (mainEquityRatio / totalEquityRatio)) : 0;
        
        document.getElementById(`case${caseNum}-dividend`).value = formatNumberWithCommas(mainAllocatedDividend);
        
        // 총합 업데이트
        updateCaseTotal(caseNum);
    }
}

// 시나리오 테이블 업데이트 (추가 인원 행 생성/제거)
function updateScenarioTable() {
    const tbody = document.getElementById('scenario-tbody');
    
    // 기존 추가 인원 행들 제거
    const existingAdditionalRows = tbody.querySelectorAll('.additional-person-row');
    existingAdditionalRows.forEach(row => row.remove());
    
    // 새로운 추가 인원 행들 생성
    const totalRow = tbody.querySelector('.total-row');
    
    for (let i = 0; i < additionalPersonsCount; i++) {
        const personNum = i + 1;
        
        // 급여 행
        const salaryRow = createEquityBasedPersonRow(personNum, '급여액', 'salary');
        tbody.insertBefore(salaryRow, totalRow);
        
        // 배당 행
        const dividendRow = createEquityBasedPersonRow(personNum, '배당액', 'dividend');
        tbody.insertBefore(dividendRow, totalRow);
    }
    
    // 이벤트 리스너 추가
    addEventListenersToEquityBasedInputs();
    
    // 초기값 설정: 본인이 모든 급여를 가지고, 배당만 지분율에 따라 분배
    initializeEquityBasedValues();
}

// 지분율 기반 초기값 설정 (새로 추가)
function initializeEquityBasedValues() {
    // 지분율 기반 배당 설정 자동 적용
    for (let caseNum = 1; caseNum <= 5; caseNum++) {
        setInitialDividendsByEquity(caseNum);
    }
}

// 지분율 기반 인원 행 생성
function createEquityBasedPersonRow(personNum, type, dataType) {
    const row = document.createElement('tr');
    row.className = 'additional-person-row';
    row.setAttribute('data-person-num', personNum);
    row.setAttribute('data-row-type', dataType);
    
    const label = `추가${personNum}${type} (원)`;
    
    // 급여와 배당 모두 수정 가능
    const isReadonly = '';
    
    row.innerHTML = `
        <td class="row-label">${label}</td>
        ${Array.from({length: 5}, (_, i) => 
            `<td>
                <div class="input-with-button">
                    <input type="text" id="case${i+1}-${dataType}-additional${personNum}" 
                           class="currency-input table-input additional-person-input" 
                           ${isReadonly} data-person-num="${personNum}" data-type="${dataType}" data-case="${i+1}">
                    <button class="max-button" onclick="fillRemainingAmount(${i+1}, '${dataType}', ${personNum})" title="남은 전액 입력">전액</button>
                    <button class="diff-button" onclick="fillDifferenceAmount(${i+1}, '${dataType}', ${personNum})" title="차액 입력">차액</button>
                </div>
            </td>`
        ).join('')}
    `;
    
    return row;
}

// 지분율 기반 입력 이벤트 리스너 추가
function addEventListenersToEquityBasedInputs() {
    // 본인 급여 변경 시 추가 인원들 자동 계산
    for (let caseNum = 1; caseNum <= 5; caseNum++) {
        const mainSalaryInput = document.getElementById(`case${caseNum}-salary`);
        const mainDividendInput = document.getElementById(`case${caseNum}-dividend`);
        
        if (mainSalaryInput) {
            mainSalaryInput.addEventListener('input', function(e) {
                formatCurrencyInput(e.target);
                handleMainSalaryChange(caseNum);
            });
            mainSalaryInput.addEventListener('keydown', restrictToNumbers);
        }
        if (mainDividendInput) {
            mainDividendInput.addEventListener('input', function(e) {
                formatCurrencyInput(e.target);
                handleMainDividendChange(caseNum);
            });
            mainDividendInput.addEventListener('keydown', restrictToNumbers);
        }
        
        // 추가 인원들의 급여/배당 입력 이벤트 리스너
        for (let i = 0; i < additionalPersonsCount; i++) {
            const personNum = i + 1;
            const additionalSalaryInput = document.getElementById(`case${caseNum}-salary-additional${personNum}`);
            const additionalDividendInput = document.getElementById(`case${caseNum}-dividend-additional${personNum}`);
            
            // 급여 입력 이벤트
            if (additionalSalaryInput) {
                additionalSalaryInput.addEventListener('input', function(e) {
                    formatCurrencyInput(e.target);
                    handleAdditionalSalaryChange(caseNum, personNum);
                });
                
                additionalSalaryInput.addEventListener('keydown', restrictToNumbers);
                
                additionalSalaryInput.addEventListener('paste', function(e) {
                    setTimeout(() => {
                        formatCurrencyInput(e.target);
                        handleAdditionalSalaryChange(caseNum, personNum);
                    }, 0);
                });
            }
            
            // 배당 입력 이벤트
            if (additionalDividendInput) {
                additionalDividendInput.addEventListener('input', function(e) {
                    formatCurrencyInput(e.target);
                    handleAdditionalDividendChange(caseNum, personNum);
                });
                
                additionalDividendInput.addEventListener('keydown', restrictToNumbers);
                
                additionalDividendInput.addEventListener('paste', function(e) {
                    setTimeout(() => {
                        formatCurrencyInput(e.target);
                        handleAdditionalDividendChange(caseNum, personNum);
                    }, 0);
                });
            }
        }
    }
}

// 지분율 기반으로 단일 케이스 재계산
function recalculateSingleCaseWithEquity(caseNum) {
    const totalAmount = getTotalAmount(); // 총 처분 가능 금액
    const mainSalary = parseNumberFromInput(document.getElementById(`case${caseNum}-salary`).value);
    const mainDividend = parseNumberFromInput(document.getElementById(`case${caseNum}-dividend`).value);
    
    // 본인의 지분율
    const mainEquityRatio = equityRatios[0] / 100;
    
    // 전체 지분율 합계 계산
    const totalEquityRatio = equityRatios.reduce((sum, ratio) => sum + ratio, 0) / 100;
    
    // 본인의 지분율이 0이거나 전체 지분율이 0이면 계산하지 않음
    if (mainEquityRatio === 0 || totalEquityRatio === 0) {
        return;
    }
    
    // 본인의 총 금액 (급여 + 배당)
    const mainTotal = mainSalary + mainDividend;
    
    // 배당 비율만 지분율 기준으로 계산 (급여는 본인이 모두 가짐)
    let totalDividendAmount = 0;
    
    if (mainTotal > 0) {
        // 본인의 배당:총액 비율
        const dividendRatio = mainDividend / mainTotal;
        
        // 총 배당 금액은 총 금액의 배당 비율만큼
        totalDividendAmount = totalAmount * dividendRatio;
    }
    
    // 추가 인원들의 배당 계산 (지분율 기준)
    for (let i = 0; i < additionalPersonsCount; i++) {
        const personNum = i + 1;
        const additionalEquityRatio = equityRatios[personNum] / 100;
        
        // 추가 인원의 배당 = 총 배당액 × (추가 인원 지분율 / 전체 지분율)
        const additionalDividend = totalDividendAmount > 0 ? 
            Math.round(totalDividendAmount * (additionalEquityRatio / totalEquityRatio)) : 0;
        
        // 추가 인원의 급여는 초기에 0으로 설정 (사용자가 직접 입력)
        const currentAdditionalSalary = parseNumberFromInput(
            document.getElementById(`case${caseNum}-salary-additional${personNum}`).value || '0'
        );
        
        // 배당만 업데이트 (급여는 기존 값 유지 또는 0으로 초기화)
        document.getElementById(`case${caseNum}-salary-additional${personNum}`).value = 
            formatNumberWithCommas(currentAdditionalSalary);
        document.getElementById(`case${caseNum}-dividend-additional${personNum}`).value = 
            formatNumberWithCommas(additionalDividend);
    }
    
    // 본인의 배당 계산 (지분율 기준)
    const mainAllocatedDividend = totalDividendAmount > 0 ? 
        Math.round(totalDividendAmount * (mainEquityRatio / totalEquityRatio)) : 0;
    
    // 추가 인원들의 급여 총합 계산
    let totalAdditionalSalary = 0;
    for (let i = 0; i < additionalPersonsCount; i++) {
        const personNum = i + 1;
        const additionalSalaryElement = document.getElementById(`case${caseNum}-salary-additional${personNum}`);
        if (additionalSalaryElement) {
            totalAdditionalSalary += parseNumberFromInput(additionalSalaryElement.value) || 0;
        }
    }
    
    // 추가 인원들의 배당 총합 계산
    let totalAdditionalDividend = 0;
    for (let i = 0; i < additionalPersonsCount; i++) {
        const personNum = i + 1;
        const additionalDividendElement = document.getElementById(`case${caseNum}-dividend-additional${personNum}`);
        if (additionalDividendElement) {
            totalAdditionalDividend += parseNumberFromInput(additionalDividendElement.value) || 0;
        }
    }
    
    // 본인의 급여 = 총액 - 모든 배당 - 추가 인원들 급여
    const adjustedMainSalary = Math.max(0, totalAmount - mainAllocatedDividend - totalAdditionalDividend - totalAdditionalSalary);
    
    // 본인 입력 필드 업데이트 (무한 루프 방지를 위해 현재 값과 차이가 클 때만)
    const mainSalaryInput = document.getElementById(`case${caseNum}-salary`);
    const mainDividendInput = document.getElementById(`case${caseNum}-dividend`);
    
    if (Math.abs(parseNumberFromInput(mainSalaryInput.value) - adjustedMainSalary) > 1000) {
        mainSalaryInput.value = formatNumberWithCommas(adjustedMainSalary);
    }
    if (Math.abs(parseNumberFromInput(mainDividendInput.value) - mainAllocatedDividend) > 1000) {
        mainDividendInput.value = formatNumberWithCommas(mainAllocatedDividend);
    }
    
    // 총합 업데이트
    updateCaseTotal(caseNum);
}

// 지분율 기반으로 모든 케이스 재계산
function recalculateAllCasesWithEquity() {
    for (let caseNum = 1; caseNum <= 5; caseNum++) {
        recalculateSingleCaseWithEquity(caseNum);
    }
}

// 본인 급여 변경 처리
function handleMainSalaryChange(caseNum) {
    updateCaseTotal(caseNum);
    checkTotalAmountStatus(caseNum);
}

// 본인 배당 변경 처리
function handleMainDividendChange(caseNum) {
    updateCaseTotal(caseNum);
    checkTotalAmountStatus(caseNum);
}

// 추가 인원 급여 변경 처리
function handleAdditionalSalaryChange(caseNum, personNum) {
    updateCaseTotal(caseNum);
    checkTotalAmountStatus(caseNum);
}

// 추가 인원 배당 변경 처리 (단순 입력만 처리)
function handleAdditionalDividendChange(caseNum, personNum) {
    updateCaseTotal(caseNum);
    checkTotalAmountStatus(caseNum);
}

// 추가 인원을 위한 간소화된 세금 계산
function calculateAdditionalPersonCase(salary, dividend) {
    const result = {};
    
    // 1. 근로소득 계산
    result.totalSalary = salary;
    const earnedIncomeDeductionDetail = calculateEarnedIncomeDeduction(salary);
    result.earnedIncomeDeduction = earnedIncomeDeductionDetail.amount;
    result.earnedIncome = salary - result.earnedIncomeDeduction;
    
    const socialInsuranceDetail = calculateSocialInsurance(salary);
    result.socialInsurance = socialInsuranceDetail.total;
    
    // 2. 배당소득 계산
    result.dividendIncome = dividend;
    const grossUpDetail = calculateDividendGrossUp(dividend);
    result.grossUp = grossUpDetail.amount;
    
    // 3. 종합소득 계산
    result.totalIncome = result.earnedIncome + result.dividendIncome + result.grossUp;
    
    // 4. 간소화된 소득공제 (본인 인적공제 + 4대보험료 + 기본 소득공제)
    const personalDeduction = DEDUCTIONS.personal; // 본인 150만원
    const pensionDeduction = result.socialInsurance; // 4대보험료
    
    // 신용카드 등 기본 소득공제 (간소화)
    const creditCardThreshold = result.earnedIncome * 0.25;
    const estimatedCreditCardUsage = Math.min(result.earnedIncome * 0.3, 30000000);
    const creditCardDeduction = Math.max(0, Math.min((estimatedCreditCardUsage - creditCardThreshold) * 0.2, 3000000));
    
    result.totalDeductions = personalDeduction + pensionDeduction + creditCardDeduction;
    
    // 5. 과세표준
    result.taxableIncome = Math.max(result.totalIncome - result.totalDeductions, 0);
    
    // 6. 산출세액
    result.calculatedTax = calculateIncomeTax(result.taxableIncome);
    
    // 7. 간소화된 세액공제 (배당세액공제 + 근로소득세액공제 + 최적 세액공제)
    const dividendCreditDetail = calculateDividendCredit(result.dividendIncome, result.grossUp);
    result.dividendCredit = dividendCreditDetail.amount;
    result.earnedIncomeTaxCredit = calculateEarnedIncomeTaxCredit(result.calculatedTax, salary);
    
    // 특별세액공제 vs 표준세액공제 중 유리한 것 선택
    const taxCreditDetail = calculateTaxCredit('standard');
    result.optimalTaxCredit = taxCreditDetail.amount;
    
    // 8. 결정세액
    const totalCredits = result.dividendCredit + result.earnedIncomeTaxCredit + result.optimalTaxCredit;
    result.finalTax = Math.max(result.calculatedTax - totalCredits, 0);
    
    // 9. 법인세 절감효과
    const companySocialInsuranceDetail = calculateCompanySocialInsurance(salary);
    const totalLaborCost = salary + companySocialInsuranceDetail.amount;
    result.corporateTaxSaving = calculateCorporateTax(totalLaborCost);
    result.companySocialInsurance = companySocialInsuranceDetail.amount;
    
    // 10. 총 개인부담액
    result.totalPersonalBurden = result.finalTax + result.socialInsurance;
    
    // 11. 순 세금효과
    result.netTaxEffect = result.totalPersonalBurden - result.corporateTaxSaving;
    
    return result;
}

// 초기값으로 리셋하는 함수
function resetToInitialValues() {
    // 리셋 버튼 애니메이션 효과
    const resetButton = document.querySelector('.reset-button');
    resetButton.classList.add('clicked');
    
    // 애니메이션이 끝나면 클래스 제거
    setTimeout(() => {
        resetButton.classList.remove('clicked');
    }, 800);
    
    // 1. 총처분 가능 금액 초기화
    const totalAmountInput = document.getElementById('total-amount');
    totalAmountInput.value = formatNumberWithCommas(150000000); // 1.5억원
    
    // 2. 추가 인원 수 초기화
    const additionalPersonsSelect = document.getElementById('additional-persons');
    if (additionalPersonsSelect) {
        additionalPersonsSelect.value = '0';
        additionalPersonsCount = 0;
    }
    
    // 3. 지분율 초기화
    equityRatios = [100]; // 본인 100%
    
    // 4. 지분율 섹션 숨기기
    const equitySection = document.getElementById('equity-section');
    if (equitySection) {
        equitySection.style.display = 'none';
    }
    
    // 5. 추가 인원 행들 제거
    const tbody = document.getElementById('scenario-tbody');
    const existingAdditionalRows = tbody.querySelectorAll('.additional-person-row');
    existingAdditionalRows.forEach(row => row.remove());
    
    // 6. 케이스별 기본값 설정
    const defaultValues = [
        { salary: 130000000, dividend: 0 },         // CASE 1: 급여 중심
        { salary: 110000000, dividend: 20000000 },  // CASE 2: 혼합 1
        { salary: 90000000, dividend: 40000000 },   // CASE 3: 혼합 2
        { salary: 70000000, dividend: 60000000 },   // CASE 4: 혼합 3
        { salary: 60000000, dividend: 70000000 }    // CASE 5: 배당 중심
    ];
    
    const totalAmount = 150000000; // 1.5억원
    
    for (let i = 0; i < defaultValues.length; i++) {
        const caseNum = i + 1;
        const defaultTotal = defaultValues[i].salary + defaultValues[i].dividend;
        
        // 비율 유지하면서 총액에 맞춰 조정
        const salaryRatio = defaultValues[i].salary / defaultTotal;
        const newSalary = Math.round(totalAmount * salaryRatio);
        const newDividend = totalAmount - newSalary;
        
        // 입력 필드 업데이트
        document.getElementById(`case${caseNum}-salary`).value = formatNumberWithCommas(newSalary);
        document.getElementById(`case${caseNum}-dividend`).value = formatNumberWithCommas(newDividend);
        
        // 총 금액 업데이트
        document.getElementById(`case${caseNum}-total`).textContent = formatNumberWithCommas(totalAmount);
    }
    
    // 7. 결과 섹션 숨기기
    const resultsSection = document.getElementById('results-section');
    if (resultsSection) {
        resultsSection.style.display = 'none';
    }
    
    // 8. 모든 상세 분석 탭 초기화
    const tabButtons = document.querySelectorAll('.tab-button');
    const detailContents = document.querySelectorAll('.detail-content');
    
    tabButtons.forEach((btn, index) => {
        if (index === 0) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    
    detailContents.forEach((content, index) => {
        if (index === 0) {
            content.classList.add('active');
        } else {
            content.classList.remove('active');
        }
    });
    
    // 9. 사용자에게 리셋 완료 피드백
    showResetNotification();
    
    console.log('초기값으로 리셋 완료');
}

// 리셋 완료 알림 표시
function showResetNotification() {
    // 기존 알림이 있으면 제거
    const existingNotification = document.querySelector('.reset-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // 새로운 알림 생성
    const notification = document.createElement('div');
    notification.className = 'reset-notification';
    notification.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        초기값으로 리셋되었습니다
    `;
    
    // 페이지에 추가
    document.body.appendChild(notification);
    
    // 3초 후 자동 제거
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 3000);
}

// 총액 제한 알림 표시
function showLimitNotification(message) {
    // 기존 알림이 있으면 제거
    const existingNotification = document.querySelector('.limit-notification');
    if (existingNotification) {
        existingNotification.remove();
    }
    
    // 새로운 알림 생성
    const notification = document.createElement('div');
    notification.className = 'limit-notification';
    notification.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 9V13M12 17H12.01M21 12C21 16.9706 16.9706 21 12 21C7.02944 21 3 16.9706 3 12C3 7.02944 7.02944 3 12 3C16.9706 3 21 7.02944 21 12Z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
        ${message}
    `;
    
    // 페이지에 추가
    document.body.appendChild(notification);
    
    // 4초 후 자동 제거
    setTimeout(() => {
        notification.classList.add('fade-out');
        setTimeout(() => {
            if (notification.parentNode) {
                notification.remove();
            }
        }, 300);
    }, 4000);
}

// 본인 지분율 자동 조정 (추가 인원들 지분율에 따라)
function adjustMainEquityRatio() {
    // 추가 인원들의 지분율 합계 계산
    let additionalEquitySum = 0;
    for (let i = 1; i <= additionalPersonsCount; i++) {
        additionalEquitySum += equityRatios[i] || 0;
    }
    
    // 본인 지분율 = 100 - 추가 인원들 지분율 합계
    const adjustedMainEquity = Math.max(0, 100 - additionalEquitySum);
    equityRatios[0] = adjustedMainEquity;
    
    // 본인 지분율 입력 필드 업데이트
    const mainEquityInput = document.getElementById('equity-main');
    if (mainEquityInput) {
        mainEquityInput.value = adjustedMainEquity;
    }
    
    // 100%를 초과하는 경우 경고 표시
    if (additionalEquitySum > 100) {
        showLimitNotification('총 지분율이 100%를 초과할 수 없습니다. 추가 인원들의 지분율을 조정해주세요.');
    }
}

// 지분율 입력 필드 포커스 시 전체 선택
function setupEquityInputFocus(inputElement) {
    if (!inputElement) return;
    
    // 포커스 시 전체 선택
    inputElement.addEventListener('focus', function() {
        this.select();
    });
    
    // 클릭 시에도 전체 선택
    inputElement.addEventListener('click', function() {
        this.select();
    });
}

// 지분율 입력 필드 이벤트 리스너 설정
function setupEquityInputListeners() {
    // 본인 지분율 입력 필드
    const mainEquityInput = document.getElementById('equity-main');
    if (mainEquityInput) {
        setupEquityInputFocus(mainEquityInput);
        
        // 본인 지분율 변경 시 이벤트
        mainEquityInput.addEventListener('input', function() {
            handleEquityChange('equity-main');
        });
    }
    
    // 추가 인원들 지분율 입력 필드
    for (let i = 1; i <= additionalPersonsCount; i++) {
        const additionalEquityInput = document.getElementById(`equity-additional-${i}`);
        if (additionalEquityInput) {
            setupEquityInputFocus(additionalEquityInput);
            
            // 추가 인원 지분율 변경 시 이벤트
            additionalEquityInput.addEventListener('input', function() {
                handleEquityChange(`equity-additional-${i}`);
            });
        }
    }
}

// 가장 유리한 케이스 찾기 (실질 부담 총세금이 가장 낮은 케이스)
function findBestCase(cases) {
    let bestCaseIndex = 0;
    let lowestNetEffect = cases[0].netTaxEffect;
    
    for (let i = 1; i < cases.length; i++) {
        if (cases[i].netTaxEffect < lowestNetEffect) {
            lowestNetEffect = cases[i].netTaxEffect;
            bestCaseIndex = i;
        }
    }
    
    return bestCaseIndex + 1; // 1-based index
}

// 특정 케이스를 활성화하는 함수
function activateDetailCase(caseNumber) {
    // 모든 탭 비활성화
    document.querySelectorAll('.detail-content').forEach(content => {
        content.classList.remove('active');
    });
    document.querySelectorAll('.detail-tabs .tab-button').forEach(button => {
        button.classList.remove('active');
    });
    
    // 지정된 케이스 활성화
    const targetDetail = document.getElementById(`detail${caseNumber}`);
    const targetButton = document.querySelector(`.tab-button[onclick="showDetail('detail${caseNumber}')"]`);
    
    if (targetDetail) {
        targetDetail.classList.add('active');
    }
    if (targetButton) {
        targetButton.classList.add('active');
    }
}

// 총액 상태 확인 및 시각적 피드백
function checkTotalAmountStatus(caseNum) {
    const totalAmount = getTotalAmount();
    const totalElement = document.getElementById(`case${caseNum}-total`);
    
    // 현재 사용 금액 계산
    let totalUsed = 0;
    
    // 본인 급여 + 배당
    totalUsed += parseNumberFromInput(document.getElementById(`case${caseNum}-salary`).value) || 0;
    totalUsed += parseNumberFromInput(document.getElementById(`case${caseNum}-dividend`).value) || 0;
    
    // 추가 인원들 급여 + 배당
    for (let i = 0; i < additionalPersonsCount; i++) {
        const personNum = i + 1;
        const salaryElement = document.getElementById(`case${caseNum}-salary-additional${personNum}`);
        const dividendElement = document.getElementById(`case${caseNum}-dividend-additional${personNum}`);
        
        if (salaryElement) totalUsed += parseNumberFromInput(salaryElement.value) || 0;
        if (dividendElement) totalUsed += parseNumberFromInput(dividendElement.value) || 0;
    }
    
    // 차액 계산
    const difference = totalAmount - totalUsed;
    
    // 기존 상태 메시지 제거
    const existingStatus = document.getElementById(`case${caseNum}-status`);
    if (existingStatus) {
        existingStatus.remove();
    }
    
    // 총액 표시 색상 변경
    if (difference === 0) {
        // 정확히 맞음
        totalElement.style.color = '#28a745';
        totalElement.style.fontWeight = 'bold';
    } else if (difference > 0) {
        // 부족함 (남은 금액 있음)
        totalElement.style.color = '#007bff';
        totalElement.style.fontWeight = 'bold';
        
        // 상태 메시지 추가
        const statusDiv = document.createElement('div');
        statusDiv.id = `case${caseNum}-status`;
        statusDiv.className = 'amount-status';
        statusDiv.innerHTML = `<span class="status-text">남은 금액: ${formatNumberWithCommas(difference)}원</span>`;
        totalElement.parentNode.appendChild(statusDiv);
    } else {
        // 초과함
        totalElement.style.color = '#dc3545';
        totalElement.style.fontWeight = 'bold';
        
        // 상태 메시지 추가
        const statusDiv = document.createElement('div');
        statusDiv.id = `case${caseNum}-status`;
        statusDiv.className = 'amount-status error';
        statusDiv.innerHTML = `<span class="status-text">초과 금액: ${formatNumberWithCommas(Math.abs(difference))}원</span>`;
        totalElement.parentNode.appendChild(statusDiv);
    }
}

// 지분율 기반 초기 배당 설정
function setInitialDividendsByEquity(caseNum) {
    const totalAmount = getTotalAmount();
    const mainSalary = parseNumberFromInput(document.getElementById(`case${caseNum}-salary`).value) || 0;
    
    // 모든 급여 합계 계산
    let totalSalary = mainSalary;
    for (let i = 0; i < additionalPersonsCount; i++) {
        const personNum = i + 1;
        const salaryElement = document.getElementById(`case${caseNum}-salary-additional${personNum}`);
        if (salaryElement) {
            totalSalary += parseNumberFromInput(salaryElement.value) || 0;
        }
    }
    
    // 배당 가능한 금액
    const availableForDividends = Math.max(0, totalAmount - totalSalary);
    
    if (availableForDividends <= 0) return;
    
    // 지분율 기반 배당 설정
    const mainEquityRatio = equityRatios[0] / 100;
    const mainDividend = Math.round(availableForDividends * mainEquityRatio);
    document.getElementById(`case${caseNum}-dividend`).value = formatNumberWithCommas(mainDividend);
    
    // 추가 인원들 배당 설정
    for (let i = 0; i < additionalPersonsCount; i++) {
        const personNum = i + 1;
        const additionalEquityRatio = equityRatios[personNum] / 100;
        const additionalDividend = Math.round(availableForDividends * additionalEquityRatio);
        document.getElementById(`case${caseNum}-dividend-additional${personNum}`).value = formatNumberWithCommas(additionalDividend);
    }
    
    updateCaseTotal(caseNum);
    checkTotalAmountStatus(caseNum);
}

// 남은 전액 입력 기능
function fillRemainingAmount(caseNum, inputType, personNum = null) {
    const totalAmount = getTotalAmount();
    
    // 현재 사용 금액 계산 (해당 입력 필드 제외)
    let totalUsed = 0;
    
    // 본인 급여 + 배당
    if (!(inputType === 'salary' && personNum === null)) {
        totalUsed += parseNumberFromInput(document.getElementById(`case${caseNum}-salary`).value) || 0;
    }
    if (!(inputType === 'dividend' && personNum === null)) {
        totalUsed += parseNumberFromInput(document.getElementById(`case${caseNum}-dividend`).value) || 0;
    }
    
    // 추가 인원들 급여 + 배당
    for (let i = 0; i < additionalPersonsCount; i++) {
        const pNum = i + 1;
        
        if (!(inputType === 'salary' && personNum === pNum)) {
            const salaryElement = document.getElementById(`case${caseNum}-salary-additional${pNum}`);
            if (salaryElement) totalUsed += parseNumberFromInput(salaryElement.value) || 0;
        }
        
        if (!(inputType === 'dividend' && personNum === pNum)) {
            const dividendElement = document.getElementById(`case${caseNum}-dividend-additional${pNum}`);
            if (dividendElement) totalUsed += parseNumberFromInput(dividendElement.value) || 0;
        }
    }
    
    // 남은 금액 계산
    const remainingAmount = Math.max(0, totalAmount - totalUsed);
    
    // 해당 입력 필드에 남은 금액 입력
    let targetInput;
    if (personNum === null) {
        targetInput = document.getElementById(`case${caseNum}-${inputType}`);
    } else {
        targetInput = document.getElementById(`case${caseNum}-${inputType}-additional${personNum}`);
    }
    
    if (targetInput) {
        targetInput.value = formatNumberWithCommas(remainingAmount);
        updateCaseTotal(caseNum);
        checkTotalAmountStatus(caseNum);
    }
}

// 모든 케이스에 지분율 기반 배당 설정
function setAllDividendsByEquity() {
    const totalAmount = getTotalAmount();
    
    if (additionalPersonsCount === 0) {
        // 추가인원이 없을 때는 기본 케이스 유지
        setDefaultValues();
        return;
    }
    
    // 보수적 추가인원 활용 전략
    const conservativeStrategies = [
        { 
            name: "급여 중심",
            mainSalaryRatio: 0.80,      // 본인 급여 80%
            additionalSalaryRatio: 0.07, // 추가인원당 급여 7%
            dividendRatio: 0.13         // 배당 13%
        },
        { 
            name: "혼합 1",
            mainSalaryRatio: 0.60,      // 본인 급여 60%
            additionalSalaryRatio: 0.10, // 추가인원당 급여 10%
            dividendRatio: 0.30         // 배당 30%
        },
        { 
            name: "혼합 2",
            mainSalaryRatio: 0.40,      // 본인 급여 40%
            additionalSalaryRatio: 0.10, // 추가인원당 급여 10%
            dividendRatio: 0.50         // 배당 50%
        },
        { 
            name: "혼합 3",
            mainSalaryRatio: 0.25,      // 본인 급여 25%
            additionalSalaryRatio: 0.05, // 추가인원당 급여 5%
            dividendRatio: 0.70         // 배당 70%
        },
        { 
            name: "배당 중심",
            mainSalaryRatio: 0.15,      // 본인 급여 15%
            additionalSalaryRatio: 0.05, // 추가인원당 급여 5%
            dividendRatio: 0.80         // 배당 80%
        }
    ];
    
    // 각 케이스별 설정
    for (let caseNum = 1; caseNum <= 5; caseNum++) {
        const strategy = conservativeStrategies[caseNum - 1];
        
        // 본인 급여 계산
        const mainSalary = Math.round(totalAmount * strategy.mainSalaryRatio);
        
        // 추가인원 급여 계산 (보수적 적용)
        const additionalSalaryPerPerson = Math.round(totalAmount * strategy.additionalSalaryRatio);
        
        // 배당 계산 (지분율 기반)
        const totalDividend = Math.round(totalAmount * strategy.dividendRatio);
        
        // 본인 배당 (지분율 기반)
        const mainEquityRatio = equityRatios[0] / 100;
        const mainDividend = Math.round(totalDividend * mainEquityRatio);
        
        // 입력 필드에 값 설정
        document.getElementById(`case${caseNum}-salary`).value = formatNumberWithCommas(mainSalary);
        document.getElementById(`case${caseNum}-dividend`).value = formatNumberWithCommas(mainDividend);
        
        // 추가인원 설정
        for (let i = 0; i < additionalPersonsCount; i++) {
            const personNum = i + 1;
            const personSalaryElement = document.getElementById(`case${caseNum}-salary-additional${personNum}`);
            const personDividendElement = document.getElementById(`case${caseNum}-dividend-additional${personNum}`);
            
            if (personSalaryElement && personDividendElement) {
                // 추가인원 급여 (보수적 적용)
                personSalaryElement.value = formatNumberWithCommas(additionalSalaryPerPerson);
                
                // 추가인원 배당 (지분율 기반)
                const personEquityRatio = equityRatios[i + 1] / 100;
                const personDividend = Math.round(totalDividend * personEquityRatio);
                personDividendElement.value = formatNumberWithCommas(personDividend);
            }
        }
    }
    
    // 케이스별 설명 업데이트
    updateCaseDescriptionsWithAdditionalPersons();
    updateAllCaseTotals();
    
    // 알림 표시
    showEquityNotification();
}

// 추가인원 포함 케이스 설명 업데이트
function updateCaseDescriptionsWithAdditionalPersons() {
    const caseHeaders = document.querySelectorAll('.case-header');
    const descriptions = [
        `급여 중심<br><span class="case-subtitle">보수적 추가인원 활용</span>`,
        `혼합 1<br><span class="case-subtitle">균형잡힌 분산 전략</span>`,
        `혼합 2<br><span class="case-subtitle">배당 중심 전략</span>`,
        `혼합 3<br><span class="case-subtitle">높은 배당 비율</span>`,
        `배당 중심<br><span class="case-subtitle">최대 배당 활용</span>`
    ];
    
    caseHeaders.forEach((header, index) => {
        if (index > 0) { // 첫 번째는 "구분" 헤더이므로 제외
            header.innerHTML = `CASE ${index}<br><span class="case-subtitle">${descriptions[index-1].split('<br>')[1]}</span>`;
        }
    });
}

// 지분율 기반 배당 설정 알림
function showEquityNotification() {
    const notification = document.createElement('div');
    notification.className = 'notification success';
    notification.innerHTML = `
        <div class="notification-content">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div>
                <strong>지분율 기반 배당 설정 완료</strong>
                <p>보수적인 추가인원 활용 전략으로 케이스들이 설정되었습니다.</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 3000);
}

// 차액 입력 함수 - 총 금액에서 다른 입력값들을 뺀 차액을 계산해서 입력
function fillDifferenceAmount(caseNum, inputType, personNum = null) {
    const totalAmount = getTotalAmount();
    
    if (totalAmount <= 0) {
        showLimitNotification('총 처분 가능 금액을 먼저 입력해주세요.');
        return;
    }
    
    // 해당 케이스의 모든 입력값들의 합계 계산
    let currentSum = 0;
    
    // 본인 급여/배당 합계
    const mainSalary = parseNumberFromInput(document.getElementById(`case${caseNum}-salary`).value);
    const mainDividend = parseNumberFromInput(document.getElementById(`case${caseNum}-dividend`).value);
    
    // 추가 인원들의 급여/배당 합계
    let additionalSum = 0;
    for (let i = 0; i < additionalPersonsCount; i++) {
        const additionalPersonNum = i + 1;
        const additionalSalaryElement = document.getElementById(`case${caseNum}-salary-additional${additionalPersonNum}`);
        const additionalDividendElement = document.getElementById(`case${caseNum}-dividend-additional${additionalPersonNum}`);
        
        if (additionalSalaryElement && additionalDividendElement) {
            additionalSum += parseNumberFromInput(additionalSalaryElement.value);
            additionalSum += parseNumberFromInput(additionalDividendElement.value);
        }
    }
    
    // 현재 수정하려는 필드를 제외한 모든 값의 합계
    if (personNum === null) {
        // 본인 필드인 경우
        if (inputType === 'salary') {
            currentSum = mainDividend + additionalSum;
        } else if (inputType === 'dividend') {
            currentSum = mainSalary + additionalSum;
        }
    } else {
        // 추가 인원 필드인 경우
        currentSum = mainSalary + mainDividend;
        
        // 다른 추가 인원들의 값들 합산
        for (let i = 0; i < additionalPersonsCount; i++) {
            const additionalPersonNum = i + 1;
            if (additionalPersonNum !== personNum) {
                const otherSalaryElement = document.getElementById(`case${caseNum}-salary-additional${additionalPersonNum}`);
                const otherDividendElement = document.getElementById(`case${caseNum}-dividend-additional${additionalPersonNum}`);
                
                if (otherSalaryElement && otherDividendElement) {
                    currentSum += parseNumberFromInput(otherSalaryElement.value);
                    currentSum += parseNumberFromInput(otherDividendElement.value);
                }
            }
        }
        
        // 같은 추가 인원의 다른 필드 값도 제외
        const targetPersonSalaryElement = document.getElementById(`case${caseNum}-salary-additional${personNum}`);
        const targetPersonDividendElement = document.getElementById(`case${caseNum}-dividend-additional${personNum}`);
        
        if (inputType === 'salary' && targetPersonDividendElement) {
            currentSum += parseNumberFromInput(targetPersonDividendElement.value);
        } else if (inputType === 'dividend' && targetPersonSalaryElement) {
            currentSum += parseNumberFromInput(targetPersonSalaryElement.value);
        }
    }
    
    // 차액 계산
    const difference = totalAmount - currentSum;
    
    // 차액이 음수인 경우 0으로 설정
    const finalAmount = Math.max(0, difference);
    
    // 해당 필드에 차액 입력
    let targetElement;
    if (personNum === null) {
        // 본인 필드
        targetElement = document.getElementById(`case${caseNum}-${inputType}`);
    } else {
        // 추가 인원 필드
        targetElement = document.getElementById(`case${caseNum}-${inputType}-additional${personNum}`);
    }
    
    if (targetElement) {
        targetElement.value = formatNumberWithCommas(finalAmount);
        
        // 입력 이벤트 트리거하여 총계 업데이트
        const event = new Event('input', { bubbles: true });
        targetElement.dispatchEvent(event);
        
        // 시각적 피드백
        targetElement.style.backgroundColor = '#e8f5e8';
        setTimeout(() => {
            targetElement.style.backgroundColor = '';
        }, 1000);
        
        // 차액 정보 알림
        if (difference < 0) {
            showDifferenceNotification(`차액이 부족하여 0원이 입력되었습니다. (부족금액: ${formatCurrency(Math.abs(difference))})`);
        } else {
            showDifferenceNotification(`차액 ${formatCurrency(finalAmount)}이 입력되었습니다.`);
        }
    }
}

// 차액 입력 알림 표시
function showDifferenceNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification info';
    notification.innerHTML = `
        <div class="notification-content">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <div>
                <strong>차액 입력 완료</strong>
                <p>${message}</p>
            </div>
        </div>
    `;
    
    document.body.appendChild(notification);
    
    setTimeout(() => {
        notification.classList.add('show');
    }, 100);
    
    setTimeout(() => {
        notification.classList.remove('show');
        setTimeout(() => {
            document.body.removeChild(notification);
        }, 300);
    }, 2500);
}