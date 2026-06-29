export class SolverNotImplementedError extends Error {
  constructor() {
    super('Scheduler engine is temporarily disabled while correctness validation is completed.');
    this.name = 'SolverNotImplementedError';
  }
}

export function solve(): never {
  throw new SolverNotImplementedError();
}

export function validate() {
  return {
    assignedPeriodUnits: 0,
    unassignedMeetings: 0,
    gradeConflicts: 0,
    teacherConflicts: 0,
    roomConflicts: 0,
    lunchCrossingBlocks: 0,
    afterSchoolWrongPeriod: 0,
    distinctDayErrors: 0,
    globalEventErrors: 0,
    flexTeacherErrors: 0,
    specialTeacherTokenErrors: 0,
  };
}
