const number = (value) => Number(value) || 0;

export function totalInvested(investments) {
  return investments.reduce((total, investment) => total + investmentValues(investment).investedAmount, 0);
}

export function totalCurrentValue(investments) {
  return investments.reduce((total, investment) => total + investmentValues(investment).currentValue, 0);
}

export function totalProfit(investments) {
  return totalCurrentValue(investments) - totalInvested(investments);
}

export function profitPercentage(investments) {
  const invested = totalInvested(investments);
  return invested > 0 ? (totalProfit(investments) / invested) * 100 : 0;
}

export function totalExpenses(transactions, month) {
  return transactions
    .filter((item) => item.type === "Expense" && (!month || item.date.startsWith(month)))
    .reduce((total, item) => total + number(item.amount), 0);
}

export function monthlyIncome(transactions, month) {
  return transactions
    .filter((item) => item.type === "Income" && item.date.startsWith(month))
    .reduce((total, item) => total + number(item.amount), 0);
}

export function monthlyInvestment(transactions, month) {
  return transactions
    .filter((item) => item.type === "Investment" && item.date.startsWith(month))
    .reduce((total, item) => total + number(item.amount), 0);
}

export function monthlyRemaining(transactions, month) {
  return monthlyIncome(transactions, month) - monthlyInvestment(transactions, month) - totalExpenses(transactions, month);
}

export function netWorth(accounts, investments, liabilities) {
  const accountValue = accounts.reduce((total, account) => total + number(account.balance), 0);
  const liabilityValue = liabilities.reduce((total, liability) => total + liabilityValues(liability).remainingAmount, 0);
  return accountValue + totalCurrentValue(investments) - liabilityValue;
}

export function liabilityValues(liability) {
  const principalAmount = Math.max(
    number(liability.principalAmount) || number(liability.totalAmount) || number(liability.amount),
    0
  );
  const paidAmount = Math.max(number(liability.paidAmount), 0);
  if (liability.import?.managed === true) {
    const monthlyPayment = Math.max(number(liability.monthlyPayment), 0);
    return {
      principalAmount,
      interestMethod: liability.interestMethod === "Fixed" ? "Fixed" : "Reducing",
      totalAmount: principalAmount,
      totalPayable: principalAmount,
      totalInterest: 0,
      paidAmount: 0,
      remainingAmount: principalAmount,
      monthlyPayment,
      percentage: 0,
      paymentsRemaining: monthlyPayment > 0 ? Math.ceil(principalAmount / monthlyPayment) : 0
    };
  }
  const annualInterestRate = Math.max(number(liability.interestRate), 0);
  const durationMonths = Math.max(Math.trunc(number(liability.durationMonths)), 0);
  const interestMethod = liability.interestMethod === "Fixed" ? "Fixed" : "Reducing";
  const monthlyRate = annualInterestRate / 1200;
  let monthlyPayment = Math.max(number(liability.monthlyPayment), 0);
  let totalPayable = Math.max(number(liability.totalAmount) || principalAmount, principalAmount);

  if (durationMonths > 0) {
    if (interestMethod === "Fixed") {
      const fixedInterest = principalAmount * (annualInterestRate / 100) * (durationMonths / 12);
      totalPayable = principalAmount + fixedInterest;
      monthlyPayment = totalPayable / durationMonths;
    } else {
      monthlyPayment = monthlyRate > 0
        ? principalAmount * monthlyRate * ((1 + monthlyRate) ** durationMonths) /
          (((1 + monthlyRate) ** durationMonths) - 1)
        : principalAmount / durationMonths;
      totalPayable = monthlyPayment * durationMonths;
    }
  }

  const totalInterest = Math.max(totalPayable - principalAmount, 0);
  const remainingAmount = Math.max(totalPayable - paidAmount, 0);

  return {
    principalAmount,
    interestMethod,
    totalAmount: totalPayable,
    totalPayable,
    totalInterest,
    paidAmount,
    remainingAmount,
    monthlyPayment,
    percentage: totalPayable > 0 ? Math.min((paidAmount / totalPayable) * 100, 100) : 0,
    paymentsRemaining: monthlyPayment > 0 ? Math.ceil(remainingAmount / monthlyPayment) : 0
  };
}

export function assetAllocation(investments, categories) {
  const investmentCategories = categories.filter((category) => category.group === "investment");
  const chartColors = ["#176b5b", "#2f80ed", "#7b61ff", "#e0a100", "#b56b00", "#00a884", "#e76f51", "#d14d72", "#77817d"];
  const categoryValues = investmentCategories.map((category) => {
    const holdingValue = investments
        .filter((investment) => investment.categoryId === category.id)
      .reduce((sum, investment) => sum + investmentValues(investment).currentValue, 0);
    return { category, value: holdingValue };
  });
  const actualTotal = categoryValues.reduce((sum, item) => sum + item.value, 0);

  return categoryValues
    .map(({ category, value }, index) => {
      const actual = actualTotal > 0 ? (value / actualTotal) * 100 : 0;
      return {
        ...category,
        color: chartColors[index % chartColors.length],
        value,
        actual
      };
    });
}

export function goalProgress(goal) {
  const target = number(goal.target);
  const current = number(goal.current);
  return {
    percentage: target > 0 ? Math.min((current / target) * 100, 100) : 0,
    remaining: Math.max(target - current, 0)
  };
}

export function monthlyPlanProgress(plans, transactions, month) {
  const target = plans.reduce((total, plan) => total + number(plan.amount), 0);
  const completed = monthlyInvestment(transactions, month);
  return {
    target,
    completed,
    remaining: Math.max(target - completed, 0),
    percentage: target > 0 ? Math.min((completed / target) * 100, 100) : 0
  };
}

export function investmentValues(investment) {
  const quantity = number(investment.quantity);
  const currentPrice = number(investment.currentPrice);
  const quoteCurrency = String(investment.currency || "INR").toUpperCase();
  const exchangeRate = quoteCurrency === "USD" ? number(investment.exchangeRate) : 1;
  const investedAmount = number(investment.investedAmount) * exchangeRate;
  const quotedValue = quantity * currentPrice * exchangeRate;
  const currentValue = quotedValue > 0 ? quotedValue : number(investment.currentValue) || investedAmount;
  const profit = currentValue - investedAmount;
  return {
    investedAmount,
    currentValue,
    profit,
    percentage: investedAmount > 0 ? (profit / investedAmount) * 100 : 0
  };
}
