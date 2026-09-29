const number = (value) => Number(value) || 0;

export function totalInvested(investments) {
  return investments.reduce((total, investment) => total + number(investment.investedAmount), 0);
}

export function totalCurrentValue(investments) {
  return investments.reduce((total, investment) => total + number(investment.currentValue), 0);
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
  const liabilityValue = liabilities.reduce((total, liability) => total + number(liability.amount), 0);
  return accountValue + totalCurrentValue(investments) - liabilityValue;
}

export function assetAllocation(investments, categories) {
  const total = totalCurrentValue(investments);
  return categories
    .filter((category) => category.group === "investment")
    .map((category) => {
      const value = investments
        .filter((investment) => investment.categoryId === category.id)
        .reduce((sum, investment) => sum + number(investment.currentValue), 0);
      const actual = total > 0 ? (value / total) * 100 : 0;
      return { ...category, value, actual, difference: actual - number(category.target) };
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
  const buyPrice = number(investment.buyPrice);
  const currentPrice = number(investment.currentPrice);
  const investedAmount = number(investment.investedAmount) || quantity * buyPrice;
  const currentValue = number(investment.currentValue) || quantity * currentPrice;
  const profit = currentValue - investedAmount;
  return {
    investedAmount,
    currentValue,
    profit,
    percentage: investedAmount > 0 ? (profit / investedAmount) * 100 : 0
  };
}
