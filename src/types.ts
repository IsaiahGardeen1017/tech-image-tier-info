export interface Config {
  gamePath: string;
  imageMagickCommand: string;
  workshop: {
    modVersion: string;
    remoteFileId: string;
  };
  colors: Record<string, string>;
  importantTechnologies: Record<string, string>;
  importantTechDots: {
    size: number;
    borderThickness: number;
    gapThickness: number;
    bottomInset: number;
  };
  border: { thickness: number };
  bars: {
    thickness: number;
    height: number;
    gapThickness: number;
    rightInset: number;
    startY: number;
    backgroundColor: string;
    backgroundPadding: number;
  };
}

export interface Technology {
  id: string;
  tier: number;
  tierSource: string;
  icon: string;
  prerequisites: string[];
  successors: string[];
  sourceFile: string;
  sourceLine: number;
}

export interface TechTree {
  gameVersion: string;
  generatedAt: string;
  technologies: Record<string, Technology>;
}

export type ReportLevel = "INFO" | "WARNING" | "ERROR";

export interface ReportItem {
  level: ReportLevel;
  code: string;
  message: string;
  details?: string[];
}
