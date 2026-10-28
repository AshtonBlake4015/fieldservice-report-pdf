import assert from "node:assert/strict";
import { chooseFollowUp, renderReport } from "./report_service.ts";

const order = {
  id: "WO-1042",
  site: "North depot",
  technician: "Mina Chen",
  status: "complete" as const,
  photos: ["before.jpg", "after.jpg"],
  follow_up: "Replace the worn seal next visit"
};

assert.equal(chooseFollowUp(order), "Replace the worn seal next visit");
assert.match(renderReport(order), /Dispatch status: complete/);
assert.match(renderReport(order), /- after.jpg/);
console.log("report decision test passed");
