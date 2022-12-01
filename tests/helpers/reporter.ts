import {SpecReporter} from "jasmine-spec-reporter";
import {StacktraceOption} from "jasmine-spec-reporter/built/configuration";

const textReporter = new SpecReporter({
    spec: {
        displayDuration: true,
        displayErrorMessages: true,
        displayStacktrace: StacktraceOption.PRETTY,
    }
});

jasmine.getEnv().clearReporters();
jasmine.getEnv().addReporter(textReporter);
