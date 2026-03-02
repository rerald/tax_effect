/**
 * 법인전환 절세 시뮬레이션 (2025년 기준)
 * 개인사업자 vs 법인 전환 후 총 세금 부담 비교
 */

/** 전역 툴팁 엘리먼트 (한 번만 생성) */
let _tooltipEl = null;
function getTooltipEl() {
    if (!_tooltipEl) {
        _tooltipEl = document.createElement('div');
        _tooltipEl.id = 'calc-tooltip';
        _tooltipEl.style.cssText = 'position:fixed;background:#2c3e50;color:#fff;padding:10px 14px;border-radius:8px;font-size:0.85rem;max-width:320px;z-index:9999;pointer-events:none;box-shadow:0 4px 12px rgba(0,0,0,0.2);white-space:pre-wrap;line-height:1.5;display:none;';
        document.body.appendChild(_tooltipEl);
    }
    return _tooltipEl;
}

/** 툴팁: 값 셀 id로 해당 행의 라벨·값 셀에 data-tooltip 설정 후 호버 시 표시 */
function setTooltipForRow(valueCellId, tooltipText) {
    if (!tooltipText) return;
    const valueCell = document.getElementById(valueCellId);
    if (!valueCell) return;
    const row = valueCell.closest('tr');
    [valueCell, row?.querySelector('td:first-child')].filter(Boolean).forEach(el => {
        el.setAttribute('data-tooltip', tooltipText);
        el.classList.add('tooltip-trigger');
    });
}

/** 툴팁 이벤트 위임 (DOMContentLoaded 시 한 번만 등록) */
function initTooltipListeners() {
    if (initTooltipListeners._done) return;
    initTooltipListeners._done = true;
    const tip = getTooltipEl();
    document.addEventListener('mouseover', function(e) {
        const el = e.target.closest('[data-tooltip]');
        if (el) {
            tip.textContent = el.getAttribute('data-tooltip');
            tip.style.display = 'block';
            const rect = el.getBoundingClientRect();
            let left = rect.left + (rect.width / 2) - 160;
            let top = rect.bottom + 8;
            if (left < 8) left = 8;
            if (left + 320 > window.innerWidth) left = window.innerWidth - 328;
            if (top + 150 > window.innerHeight) {
                top = rect.top - 8;
                tip.style.transform = 'translateY(-100%)';
            } else {
                tip.style.transform = 'none';
            }
            tip.style.left = left + 'px';
            tip.style.top = top + 'px';
        }
    });
    document.addEventListener('mouseout', function(e) {
        const from = e.target.closest('[data-tooltip]');
        const to = e.relatedTarget?.closest('[data-tooltip]');
        if (from && !to) tip.style.display = 'none';
    });
}

/**
 * 개인사업자 총세금 계산 (사업소득세 + 지방소득세 + 4대보험료)
 * 사업소득 = 수익 - 비용 (이미 순이익이므로 사업소득공제 없음)
 * @param {number} businessIncome - 연간 사업소득 (수익 - 비용)
 * @param {number} familyCount - 부양가족 수 (본인 포함)
 * @returns {object} - 세금 상세
 */
function calculateIndividualBusinessTax(businessIncome, familyCount) {
    // 인적공제 (본인 150만원 + 부양가족 1인당 150만원)
    const personalDeduction = 1500000 * familyCount;
    const finalTaxableIncome = Math.max(businessIncome - personalDeduction, 0);

    const incomeTax = calculateIncomeTax(finalTaxableIncome);
    const localTax = Math.round(incomeTax * 0.1); // 지방소득세 10%

    // 개인사업자 4대보험료: 사업소득 기준, 근로자+사업주 부담분 전액 (지역가입자)
    const socialInsuranceDetail = calculateSocialInsurance(businessIncome);
    const companyInsuranceDetail = calculateCompanySocialInsurance(businessIncome);
    const socialInsurance = socialInsuranceDetail.total + companyInsuranceDetail.amount;

    const totalTax = incomeTax + localTax + socialInsurance;
    const netAmount = businessIncome - totalTax; // 순액: 소득에서 모든 차감을 뺀 잔액

    return {
        businessIncome,
        taxableIncome: finalTaxableIncome,
        incomeTax,
        localTax,
        socialInsurance,
        totalTax,
        netAmount,
        // 툴팁용 계산 기준 설명
        incomeTaxExplanation: `과세표준(사업소득 ${formatCurrency(businessIncome)} - 인적공제 ${formatCurrency(personalDeduction)})에 누진세율(6%~45%) 적용`,
        localTaxExplanation: `종합소득세 × 10%`,
        socialInsuranceExplanation: socialInsuranceDetail.explanation + ' + 회사부담분: ' + companyInsuranceDetail.explanation
    };
}

/**
 * 법인 전환 후 총 부담 계산
 * 법인세를 차감한 잔액에서 급여+배당이 이루어짐
 * @param {number} corporateIncome - 법인소득 (사업소득과 동일 가정)
 * @param {number} salaryRatio - 급여 비율 (0~1, 분배 가능 잔액 기준)
 * @param {number} familyCount - 부양가족 수
 * @param {number} [goodwill=0] - 영업권 금액 (5년 균등 상각)
 * @returns {object} - 총 부담 상세
 */
function calculateCorporateConversionTax(corporateIncome, salaryRatio, familyCount, goodwill = 0) {
    // 1. 영업권 상각비 (5년 정액법) 및 법인세 과세소득
    const goodwillDepreciation = Math.max(goodwill, 0) / 5;
    const taxableCorporateIncome = Math.max(corporateIncome - goodwillDepreciation, 0);
    const corporateTaxWithoutGoodwill = calculateCorporateTax(corporateIncome);
    const corporateTax = calculateCorporateTax(taxableCorporateIncome);
    const goodwillTaxSaving = corporateTaxWithoutGoodwill - corporateTax;

    // 2. 법인세 차감 후 잔액 = 급여+배당 분배 가능액
    const distributableAmount = corporateIncome - corporateTax;

    // 3. 영업권 상각분을 급여+배당에서 차감 → 기타소득(영업권)으로 수령
    const goodwillIncome = goodwill > 0 ? goodwillDepreciation : 0;
    const salaryDividendPool = distributableAmount - goodwillIncome;
    const salary = Math.round(salaryDividendPool * salaryRatio);
    const dividend = salaryDividendPool - salary;

    // 4. 영업권(기타소득) 세금: 60% 경비 인정 → 40% 과세 → 20% 세율 → 지방세 10% → 총 8.8%
    const goodwillTaxable = goodwillIncome * 0.4;
    const goodwillIncomeTax = Math.round(goodwillTaxable * 0.2);
    const goodwillLocalTax = Math.round(goodwillIncomeTax * 0.1);
    const goodwillTotalTax = goodwillIncomeTax + goodwillLocalTax;

    // 5. 개인소득세 + 지방소득세 (급여 + 배당)
    const personalResult = calculateSingleCase(salary, dividend, familyCount, 'standard', dividend + goodwillIncome);
    const personalLocalTax = Math.round(personalResult.finalTax * 0.1); // 지방소득세 = 종합소득세의 10%
    const totalPersonalTax = personalResult.finalTax + personalLocalTax;

    const totalPersonalBurden = totalPersonalTax + goodwillTotalTax + personalResult.socialInsurance + personalResult.companySocialInsurance;
    const totalBurden = corporateTax + totalPersonalBurden;
    const netAmount = salary + dividend + goodwillIncome - totalPersonalBurden; // 순액: 급여+배당+영업권에서 개인소득세·지방세·4대보험 차감 후 잔액

    return {
        corporateIncome,
        goodwillDepreciation: goodwill > 0 ? goodwillDepreciation : 0,
        goodwillTaxSaving: goodwill > 0 ? goodwillTaxSaving : 0,
        goodwillIncome,
        goodwillTax: goodwillTotalTax,
        salaryDividendPool,
        salary,
        dividend,
        corporateTax,
        personalTax: personalResult.finalTax,
        personalLocalTax,
        totalPersonalTax,
        socialInsurance: personalResult.socialInsurance + personalResult.companySocialInsurance,
        distributableAmount,
        totalBurden,
        netAmount,
        personalResult // 툴팁용 계산 기준 설명
    };
}

/**
 * 최적 소득처분 케이스 계산 및 최적 결과 반환
 * @returns {{ result: object, bestCase: object, bestIndex: number, results: array }}
 */
function getOptimalCaseResult(businessIncome, familyCount, goodwill = 0) {
    const cases = [
        { name: 'CASE 1 (급여 중심)', salaryRatio: 0.87 },
        { name: 'CASE 2 (혼합 1)', salaryRatio: 0.70 },
        { name: 'CASE 3 (혼합 2)', salaryRatio: 0.50 },
        { name: 'CASE 4 (혼합 3)', salaryRatio: 0.30 },
        { name: 'CASE 5 (배당 중심)', salaryRatio: 0.20 }
    ];

    const results = cases.map(c => {
        const corp = calculateCorporateConversionTax(businessIncome, c.salaryRatio, familyCount, goodwill);
        return { ...c, ...corp };
    });

    const bestIndex = results.reduce((best, r, i) =>
        r.totalBurden < results[best].totalBurden ? i : best, 0);

    return {
        result: results[bestIndex],
        bestCase: cases[bestIndex],
        bestIndex,
        results
    };
}

/**
 * 메인 계산 함수
 */
function calculateConversionEffect() {
    const businessIncomeInput = document.getElementById('business-income');
    const businessIncome = parseNumberFromInput(businessIncomeInput?.value || '0');

    if (businessIncome <= 0) {
        alert('연간 예상 사업소득을 입력해주세요.');
        return;
    }

    const familyCount = parseInt(document.getElementById('family-count')?.value || '1');
    const salaryRatio = parseInt(document.getElementById('salary-ratio')?.value || '70') / 100;
    const dividendRatio = 1 - salaryRatio;
    const goodwill = parseNumberFromInput(document.getElementById('goodwill-amount')?.value || '0');

    // 개인사업자 세금
    const individualResult = calculateIndividualBusinessTax(businessIncome, familyCount);

    // A경우: 사용자 설정 비율
    const corporateResultA = calculateCorporateConversionTax(businessIncome, salaryRatio, familyCount, goodwill);

    // B경우: 최적 추천 비율
    const optimal = getOptimalCaseResult(businessIncome, familyCount, goodwill);
    const corporateResultB = optimal.result;

    // 절세 금액 (A경우: 4대보험 + 세금)
    const insuranceSavingsA = individualResult.socialInsurance - corporateResultA.socialInsurance;
    const taxSavingsA = (individualResult.incomeTax + individualResult.localTax) - (corporateResultA.corporateTax + corporateResultA.totalPersonalTax);
    const totalSavingsA = insuranceSavingsA + taxSavingsA;

    // 절세 금액 (B경우)
    const totalSavingsB = individualResult.totalTax - corporateResultB.totalBurden;

    // 결과 표시
    displayResults(individualResult, corporateResultA, corporateResultB, optimal, {
        insuranceSavingsA, taxSavingsA, totalSavingsA, totalSavingsB
    }, businessIncome, salaryRatio, dividendRatio, familyCount);

    // 브레이크이븐 분석
    runBreakEvenAnalysis(familyCount);

    // 결과 섹션 표시
    document.getElementById('results-section').style.display = 'block';
    document.getElementById('break-even-section').style.display = 'block';
    document.getElementById('results-section').scrollIntoView({ behavior: 'smooth' });
}

/**
 * 결과 표시
 */
function displayResults(individual, corporateA, corporateB, optimal, savings, businessIncome, salaryRatio, dividendRatio, familyCount) {
    const { totalSavingsA, totalSavingsB } = savings;
    const highlightEl = document.getElementById('savings-highlight');
    const maxSavings = Math.max(totalSavingsA, totalSavingsB);
    highlightEl.className = 'savings-highlight ' + (maxSavings > 0 ? 'savings-positive' : 'savings-negative');
    const goodwillNote = (corporateA.goodwillDepreciation || 0) > 0 ? ' (영업권 절세 포함)' : '';
    highlightEl.innerHTML = `<span style="color:#e74c3c;font-weight:600;">매년</span> A경우 절세액 ${formatCurrency(totalSavingsA)} (사용자 설정) | <span style="color:#e74c3c;font-weight:600;">매년</span> B경우 절세액 ${formatCurrency(totalSavingsB)} (최적 추천)${goodwillNote}`;

    document.getElementById('ind-business-income').textContent = formatCurrency(individual.businessIncome);
    document.getElementById('ind-income-tax').textContent = formatCurrency(individual.incomeTax);
    document.getElementById('ind-local-tax').textContent = formatCurrency(individual.localTax);
    document.getElementById('ind-social').textContent = formatCurrency(individual.socialInsurance);
    document.getElementById('ind-total-tax').textContent = formatCurrency(individual.totalTax);
    const indNetEl = document.getElementById('ind-net-amount');
    if (indNetEl) indNetEl.textContent = formatCurrency(individual.netAmount);

    // 개인사업자 툴팁: 종합소득세, 지방소득세, 4대보험료 계산 기준
    setTooltipForRow('ind-income-tax', individual.incomeTaxExplanation);
    setTooltipForRow('ind-local-tax', individual.localTaxExplanation);
    setTooltipForRow('ind-social', individual.socialInsuranceExplanation);

    // A경우 (사용자 설정 비율)
    const salaryPctA = Math.round(salaryRatio * 100);
    const dividendPctA = Math.round(dividendRatio * 100);
    const subtitleA = document.getElementById('corp-a-subtitle');
    if (subtitleA) subtitleA.textContent = `(급여 ${salaryPctA}% / 배당 ${dividendPctA}%)`;
    document.getElementById('corp-a-income').textContent = formatCurrency(corporateA.corporateIncome);
    const corpAGoodwillRow = document.getElementById('corp-a-goodwill-row');
    const corpAGoodwillDep = document.getElementById('corp-a-goodwill-depreciation');
    if (corpAGoodwillRow && corpAGoodwillDep) {
        if ((corporateA.goodwillDepreciation || 0) > 0) {
            corpAGoodwillRow.style.display = '';
            corpAGoodwillDep.textContent = formatCurrency(corporateA.goodwillDepreciation);
        } else {
            corpAGoodwillRow.style.display = 'none';
        }
    }
    document.getElementById('corp-a-tax').textContent = formatCurrency(corporateA.corporateTax);
    const distributableA = document.getElementById('corp-a-distributable');
    if (distributableA) distributableA.textContent = formatCurrency(corporateA.distributableAmount || (corporateA.corporateIncome - corporateA.corporateTax));
    const disposalA = (corporateA.goodwillIncome || 0) > 0
        ? `${formatCurrency(corporateA.salary)} (급여) + ${formatCurrency(corporateA.dividend)} (배당) (영업권 제외)`
        : `${formatCurrency(corporateA.salary)} (급여) + ${formatCurrency(corporateA.dividend)} (배당)`;
    document.getElementById('corp-a-disposal').textContent = disposalA;
    const corpAGoodwillIncomeRow = document.getElementById('corp-a-goodwill-income-row');
    const corpAGoodwillIncome = document.getElementById('corp-a-goodwill-income');
    const corpAGoodwillTaxRow = document.getElementById('corp-a-goodwill-tax-row');
    const corpAGoodwillTax = document.getElementById('corp-a-goodwill-tax');
    if (corpAGoodwillIncomeRow && corpAGoodwillIncome && corpAGoodwillTaxRow && corpAGoodwillTax) {
        if ((corporateA.goodwillIncome || 0) > 0) {
            corpAGoodwillIncomeRow.style.display = '';
            corpAGoodwillIncome.textContent = formatCurrency(corporateA.goodwillIncome);
            corpAGoodwillTaxRow.style.display = '';
            corpAGoodwillTax.textContent = formatCurrency(corporateA.goodwillTax || 0);
            setTooltipForRow('corp-a-goodwill-tax', '영업권(기타소득): 60% 경비 인정 → 40% 과세 → 20% 세율 + 지방세 10% → 총 8.8%');
        } else {
            corpAGoodwillIncomeRow.style.display = 'none';
            corpAGoodwillTaxRow.style.display = 'none';
        }
    }
    document.getElementById('corp-a-personal-tax').textContent = formatCurrency(corporateA.personalTax);
    const corpLocalA = document.getElementById('corp-a-local-tax');
    if (corpLocalA) corpLocalA.textContent = formatCurrency(corporateA.personalLocalTax);
    document.getElementById('corp-a-social').textContent = formatCurrency(corporateA.socialInsurance);
    const corpNetA = document.getElementById('corp-a-net-amount');
    if (corpNetA) corpNetA.textContent = formatCurrency(corporateA.netAmount);
    document.getElementById('corp-a-total').textContent = formatCurrency(corporateA.totalBurden);

    // A경우 툴팁
    if (corporateA.personalResult) {
        const pr = corporateA.personalResult;
        setTooltipForRow('corp-a-personal-tax', `급여+배당 합산 → 소득공제(근로·인적·4대보험) → 과세표준에 누진세율(6%~45%) → 배당세액공제·근로소득세액공제 등 적용`);
        setTooltipForRow('corp-a-local-tax', '종합소득세(결정세액) × 10%');
        setTooltipForRow('corp-a-social', pr.socialInsuranceExplanation + (pr.companySocialInsuranceExplanation ? '\n회사부담: ' + pr.companySocialInsuranceExplanation : ''));
    }

    // B경우 (최적 추천 비율)
    const bestCase = optimal.bestCase;
    const salaryPctB = Math.round(bestCase.salaryRatio * 100);
    const dividendPctB = 100 - salaryPctB;
    const subtitleB = document.getElementById('corp-b-subtitle');
    if (subtitleB) subtitleB.textContent = `${bestCase.name} (급여 ${salaryPctB}% / 배당 ${dividendPctB}%)`;
    document.getElementById('corp-b-income').textContent = formatCurrency(corporateB.corporateIncome);
    const corpBGoodwillRow = document.getElementById('corp-b-goodwill-row');
    const corpBGoodwillDep = document.getElementById('corp-b-goodwill-depreciation');
    if (corpBGoodwillRow && corpBGoodwillDep) {
        if ((corporateB.goodwillDepreciation || 0) > 0) {
            corpBGoodwillRow.style.display = '';
            corpBGoodwillDep.textContent = formatCurrency(corporateB.goodwillDepreciation);
        } else {
            corpBGoodwillRow.style.display = 'none';
        }
    }
    document.getElementById('corp-b-tax').textContent = formatCurrency(corporateB.corporateTax);
    const distributableB = document.getElementById('corp-b-distributable');
    if (distributableB) distributableB.textContent = formatCurrency(corporateB.distributableAmount || (corporateB.corporateIncome - corporateB.corporateTax));
    const disposalB = (corporateB.goodwillIncome || 0) > 0
        ? `${formatCurrency(corporateB.salary)} (급여) + ${formatCurrency(corporateB.dividend)} (배당) (영업권 제외)`
        : `${formatCurrency(corporateB.salary)} (급여) + ${formatCurrency(corporateB.dividend)} (배당)`;
    document.getElementById('corp-b-disposal').textContent = disposalB;
    const corpBGoodwillIncomeRow = document.getElementById('corp-b-goodwill-income-row');
    const corpBGoodwillIncome = document.getElementById('corp-b-goodwill-income');
    const corpBGoodwillTaxRow = document.getElementById('corp-b-goodwill-tax-row');
    const corpBGoodwillTax = document.getElementById('corp-b-goodwill-tax');
    if (corpBGoodwillIncomeRow && corpBGoodwillIncome && corpBGoodwillTaxRow && corpBGoodwillTax) {
        if ((corporateB.goodwillIncome || 0) > 0) {
            corpBGoodwillIncomeRow.style.display = '';
            corpBGoodwillIncome.textContent = formatCurrency(corporateB.goodwillIncome);
            corpBGoodwillTaxRow.style.display = '';
            corpBGoodwillTax.textContent = formatCurrency(corporateB.goodwillTax || 0);
            setTooltipForRow('corp-b-goodwill-tax', '영업권(기타소득): 60% 경비 인정 → 40% 과세 → 20% 세율 + 지방세 10% → 총 8.8%');
        } else {
            corpBGoodwillIncomeRow.style.display = 'none';
            corpBGoodwillTaxRow.style.display = 'none';
        }
    }
    document.getElementById('corp-b-personal-tax').textContent = formatCurrency(corporateB.personalTax);
    const corpLocalB = document.getElementById('corp-b-local-tax');
    if (corpLocalB) corpLocalB.textContent = formatCurrency(corporateB.personalLocalTax);
    document.getElementById('corp-b-social').textContent = formatCurrency(corporateB.socialInsurance);
    const corpNetB = document.getElementById('corp-b-net-amount');
    if (corpNetB) corpNetB.textContent = formatCurrency(corporateB.netAmount);
    document.getElementById('corp-b-total').textContent = formatCurrency(corporateB.totalBurden);

    // B경우 툴팁
    if (corporateB.personalResult) {
        const pr = corporateB.personalResult;
        setTooltipForRow('corp-b-personal-tax', `급여+배당 합산 → 소득공제(근로·인적·4대보험) → 과세표준에 누진세율(6%~45%) → 배당세액공제·근로소득세액공제 등 적용`);
        setTooltipForRow('corp-b-local-tax', '종합소득세(결정세액) × 10%');
        setTooltipForRow('corp-b-social', pr.socialInsuranceExplanation + (pr.companySocialInsuranceExplanation ? '\n회사부담: ' + pr.companySocialInsuranceExplanation : ''));
    }

    // 최적 소득처분 추천 테이블
    displayOptimalDisposalRecommendation(businessIncome, familyCount, individual, optimal.results);

    // 적정 전환 시점 안내
    const tipEl = document.getElementById('conversion-tip');
    if (individual.taxableIncome > 88000000) {
        tipEl.textContent = `현재 과세표준 ${formatCurrency(individual.taxableIncome)}으로, 법인 전환 시 세금 절감 효과가 있을 수 있습니다. (과세표준 8,800만원 초과 시 유리)`;
    } else {
        tipEl.textContent = `현재 과세표준 ${formatCurrency(individual.taxableIncome)}입니다. 과세표준 약 8,800만원 초과 시 개인사업자의 한계세율(35%)이 법인세율(9~19%)보다 높아져 법인 전환이 유리해질 수 있습니다.`;
    }

    // 영업권 분석 안내 (영업권 입력 시에만 표시)
    const goodwillNoteEl = document.getElementById('goodwill-analysis-note');
    if (goodwillNoteEl && (corporateA.goodwillIncome || 0) > 0) {
        goodwillNoteEl.style.display = 'block';
        goodwillNoteEl.textContent = '본 분석은 영업권 양도 소득에 대한 세금과 건강보험료가 실제 발생 시점에 일시 부과되는 점을 고려하여, 재무적 수익성 검토를 위해 해당 소득과 비용을 5년간 균등 배분하여 산출하였습니다. 영업권 소득은 원칙적으로 대금 수령 시점에 원천징수 대상이나, 원천징수되지 않은 경우 종합소득세 신고 시 합산하여 정산됩니다.';
    } else if (goodwillNoteEl) {
        goodwillNoteEl.style.display = 'none';
        goodwillNoteEl.textContent = '';
    }
}

/**
 * 최적 소득처분 방식 추천 (아이디어 C - corporate-income 연동)
 * @param {array} results - getOptimalCaseResult에서 반환된 results 배열
 */
function displayOptimalDisposalRecommendation(businessIncome, familyCount, individualResult, results) {
    const bestIndex = results.reduce((best, r, i) =>
        r.totalBurden < results[best].totalBurden ? i : best, 0);

    const tbody = document.getElementById('optimal-disposal-tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    results.forEach((r, i) => {
        const tr = document.createElement('tr');
        tr.className = i === bestIndex ? 'best-value' : '';
        tr.innerHTML = `
            <td>${r.name}${i === bestIndex ? ' ✓' : ''}</td>
            <td>${formatCurrency(r.salary)}</td>
            <td>${formatCurrency(r.dividend)}</td>
            <td>${formatCurrency(r.totalBurden)}</td>
        `;
        tbody.appendChild(tr);
    });

    const linkEl = document.getElementById('optimal-disposal-link');
    if (linkEl) {
        linkEl.href = `corporate-income.html?total=${businessIncome}`;
    }

    const descEl = document.getElementById('optimal-disposal-desc');
    if (descEl) {
        const bestSavings = individualResult.totalTax - results[bestIndex].totalBurden;
        descEl.textContent = `${results[bestIndex].name}이 가장 유리합니다. 총 부담 ${formatCurrency(results[bestIndex].totalBurden)} (총절세액 ${formatCurrency(bestSavings)} 절세 가능)`;
    }
}

/**
 * 브레이크이븐 분석 (5천만원 ~ 3억원, 1천만원 단위)
 */
function runBreakEvenAnalysis(familyCount) {
    const tbody = document.getElementById('break-even-tbody');
    tbody.innerHTML = '';

    const salaryRatio = 0.7; // 70% 급여
    let breakEvenIncome = null;

    for (let income = 50000000; income <= 300000000; income += 10000000) {
        const ind = calculateIndividualBusinessTax(income, familyCount);
        const corp = calculateCorporateConversionTax(income, salaryRatio, familyCount);
        const savings = ind.totalTax - corp.totalBurden;

        if (breakEvenIncome === null && savings > 0) {
            breakEvenIncome = income;
        }

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${formatCurrency(income)}</td>
            <td>${formatCurrency(ind.totalTax)}</td>
            <td>${formatCurrency(corp.totalBurden)}</td>
            <td class="${savings >= 0 ? 'positive' : 'negative'}">${formatCurrency(savings)}</td>
        `;
        tbody.appendChild(tr);
    }

    const breakEvenEl = document.getElementById('break-even-point');
    if (breakEvenIncome !== null) {
        breakEvenEl.textContent = `법인 전환이 유리해지는 최소 소득: 약 ${formatCurrency(breakEvenIncome)} 이상`;
    } else {
        breakEvenEl.textContent = '5천만원~3억원 구간에서 법인 전환 시 모두 유리';
    }
}

/**
 * 슬라이더 이벤트
 */
function setupEventListeners() {
    const ratioInput = document.getElementById('salary-ratio');
    const salaryValueEl = document.getElementById('salary-ratio-value');
    const dividendValueEl = document.getElementById('dividend-ratio-value');

    if (ratioInput) {
        ratioInput.addEventListener('input', function() {
            const salary = parseInt(this.value);
            const dividend = 100 - salary;
            if (salaryValueEl) salaryValueEl.textContent = salary;
            if (dividendValueEl) dividendValueEl.textContent = dividend;
        });
    }

    const businessIncomeInput = document.getElementById('business-income');
    if (businessIncomeInput) {
        businessIncomeInput.addEventListener('input', function(e) {
            formatCurrencyInput(e.target);
        });
        businessIncomeInput.addEventListener('keydown', restrictToNumbers);
        businessIncomeInput.addEventListener('paste', function(e) {
            setTimeout(() => formatCurrencyInput(e.target), 0);
        });
    }

    const goodwillInput = document.getElementById('goodwill-amount');
    if (goodwillInput) {
        goodwillInput.addEventListener('input', function(e) {
            formatCurrencyInput(e.target);
        });
        goodwillInput.addEventListener('keydown', restrictToNumbers);
        goodwillInput.addEventListener('paste', function(e) {
            setTimeout(() => formatCurrencyInput(e.target), 0);
        });
    }
}

document.addEventListener('DOMContentLoaded', function() {
    setupEventListeners();
    initTooltipListeners();

    // 기본값 설정
    const businessIncomeInput = document.getElementById('business-income');
    if (businessIncomeInput && !businessIncomeInput.value) {
        businessIncomeInput.value = formatNumberWithCommas(150000000);
    }
});
