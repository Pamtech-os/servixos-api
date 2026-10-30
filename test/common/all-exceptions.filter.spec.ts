import {
  ArgumentsHost,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AllExceptionsFilter } from 'src/common/filters/all-exceptions.filter';
import { asMock } from 'test/helpers/mock';

function makeHost(json: jest.Mock): ArgumentsHost {
  return asMock<ArgumentsHost>({
    switchToHttp: () =>
      asMock<ReturnType<ArgumentsHost['switchToHttp']>>({
        getResponse: <T>() => ({ status: () => ({ json }) }) as T,
        getRequest: <T>() => ({ method: 'GET', url: '/x' }) as T,
      }),
  });
}

describe('AllExceptionsFilter', () => {
  let filter: AllExceptionsFilter;
  let json: jest.Mock;

  beforeEach(() => {
    json = jest.fn();
    filter = new AllExceptionsFilter(asMock<ConfigService>({ get: jest.fn() }));
  });

  it('forwards an explicit error code', () => {
    // Arrange
    const exception = new ForbiddenException({
      code: 'ONBOARDING_INCOMPLETE',
      message: 'Finish setup',
    });

    // Act
    filter.catch(exception, makeHost(json));

    // Assert
    expect(json).toHaveBeenCalledWith({
      success: false,
      statusCode: 403,
      message: 'Finish setup',
      code: 'ONBOARDING_INCOMPLETE',
    });
  });

  it('forwards structured details', () => {
    // Arrange
    const exception = new BadRequestException({
      message: 'Approve sections',
      details: { missingSections: ['brand'] },
    });

    // Act
    filter.catch(exception, makeHost(json));

    // Assert
    expect(json).toHaveBeenCalledWith({
      success: false,
      statusCode: 400,
      message: 'Approve sections',
      details: { missingSections: ['brand'] },
    });
  });

  it('does not leak other keys from the exception body', () => {
    // Arrange
    const exception = new BadRequestException({
      message: 'Bad',
      internal: 'secret',
    });

    // Act
    filter.catch(exception, makeHost(json));

    // Assert
    expect(json).toHaveBeenCalledWith({
      success: false,
      statusCode: 400,
      message: 'Bad',
    });
  });
});
