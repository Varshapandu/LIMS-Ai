"use client";

export type ChatMenuNode = {
  id: string;
  label: string;
  description?: string;
  prompt?: string;
  children?: ChatMenuNode[];
};

export const chatbotMenuTree: ChatMenuNode[] = [
  {
    id: "billing",
    label: "Billing",
    description: "Invoices, dues, and billed tests",
    children: [
      {
        id: "billing-overview",
        label: "Billing Overview",
        description: "Current invoice summary",
        prompt: "Show billing details for the current visit",
      },
      {
        id: "payment-details",
        label: "Payment Details",
        description: "Paid amount, due amount, and status",
        children: [
          {
            id: "payment-status",
            label: "Payment Status",
            description: "Check paid, partial, or pending",
            prompt: "What is the payment status for the current invoice?",
          },
          {
            id: "due-amount",
            label: "Due Amount",
            description: "Check pending payment amount",
            prompt: "How much due amount is pending on the current invoice?",
          },
          {
            id: "paid-amount",
            label: "Paid Amount",
            description: "Check recorded payment amount",
            prompt: "How much amount has been paid for the current invoice?",
          },
        ],
      },
      {
        id: "billed-tests",
        label: "Billed Tests",
        description: "View tests linked to the invoice",
        prompt: "Which tests are billed in the current invoice?",
      },
    ],
  },
  {
    id: "workflow",
    label: "Workflow",
    description: "Visit progress and pending steps",
    children: [
      {
        id: "workflow-status",
        label: "Current Status",
        description: "Get overall workflow progress",
        prompt: "What is the current workflow status?",
      },
      {
        id: "pending-specimens",
        label: "Pending Specimens",
        description: "See what still needs collection",
        prompt: "Which specimens are still pending collection?",
      },
      {
        id: "collect-specimen",
        label: "Collect Specimen",
        description: "Mark items as collected",
        prompt: "Collect specimen for CBC",
      },
    ],
  },
  {
    id: "results",
    label: "Results",
    description: "Entered values, abnormal flags, and retests",
    children: [
      {
        id: "high-values",
        label: "High/Critical Values",
        description: "Review abnormal and critical results",
        prompt: "Show me high or critical values",
      },
      {
        id: "enter-result",
        label: "Enter Result",
        description: "Example result-entry command",
        prompt: "Enter result for glucose fasting as 118",
      },
      {
        id: "request-retest",
        label: "Request Retest",
        description: "Route a test back for retesting",
        prompt: "Request retest for glucose fasting",
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    description: "Analytics and report-ready visits",
    children: [
      {
        id: "reports-summary",
        label: "Reports Summary",
        description: "Open local analytics summary",
        prompt: "Show dashboard analytics summary",
      },
      {
        id: "latest-report",
        label: "Latest Report",
        description: "See the latest report-ready visit",
        prompt: "Which is the latest report-ready visit?",
      },
    ],
  },
];

export function findChatMenuNode(nodes: ChatMenuNode[], path: string[]) {
  let currentNodes = nodes;
  let currentNode: ChatMenuNode | null = null;

  for (const id of path) {
    currentNode = currentNodes.find((node) => node.id === id) || null;
    if (!currentNode) {
      return null;
    }
    currentNodes = currentNode.children || [];
  }

  return currentNode;
}
