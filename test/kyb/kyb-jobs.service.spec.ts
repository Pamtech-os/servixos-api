import { Job } from 'agenda';
import { Types } from 'mongoose';
import { SupportedCountry } from 'src/common/constants/countries.constants';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { KybJobsService } from 'src/modules/kyb/jobs/kyb-jobs.service';
import { PremblyService } from 'src/modules/kyb/services/prembly.service';
import type { VerifyRegistrationJobData } from 'src/modules/kyb/types/kyb.types';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';
import { RegistrationVerificationStatus } from 'src/modules/users/schemas/user.schema';
import { asMock } from 'test/helpers/mock';

const USER_ID = new Types.ObjectId().toString();
const PENDING_REGISTRATION = {
  number: 'RC123456',
  country: SupportedCountry.NG,
  status: RegistrationVerificationStatus.PENDING,
};

function makeJob(): Job<VerifyRegistrationJobData> {
  return {
    attrs: { data: { userId: USER_ID } },
  } as Job<VerifyRegistrationJobData>;
}

describe('KybJobsService.handleVerifyRegistration', () => {
  let service: KybJobsService;
  let usersRepository: { findById: jest.Mock; updateById: jest.Mock };
  let prembly: { isConfigured: boolean; lookupCompany: jest.Mock };

  beforeEach(() => {
    usersRepository = {
      findById: jest
        .fn()
        .mockResolvedValue({ businessRegistration: PENDING_REGISTRATION }),
      updateById: jest.fn().mockResolvedValue(null),
    };
    prembly = { isConfigured: true, lookupCompany: jest.fn() };

    service = new KybJobsService(
      asMock<AgendaService>({ define: jest.fn() }),
      asMock<UsersRepository>(usersRepository),
      asMock<PremblyService>(prembly),
    );
    jest.spyOn(Reflect.get(service, 'logger'), 'error').mockImplementation();
    jest.spyOn(Reflect.get(service, 'logger'), 'warn').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('marks the registration verified with the registry name when found', async () => {
    // Arrange
    prembly.lookupCompany.mockResolvedValue({
      found: true,
      registeredName: 'Acme Ltd',
    });

    // Act
    await service.handleVerifyRegistration(makeJob());

    // Assert
    expect(usersRepository.updateById.mock.calls[0]).toMatchObject([
      USER_ID,
      {
        businessRegistration: {
          status: RegistrationVerificationStatus.VERIFIED,
          registeredName: 'Acme Ltd',
          checkedAt: expect.any(Date) as Date,
        },
      },
    ]);
  });

  it('marks the registration not_found when the registry has no match', async () => {
    // Arrange
    prembly.lookupCompany.mockResolvedValue({ found: false });

    // Act
    await service.handleVerifyRegistration(makeJob());

    // Assert
    expect(usersRepository.updateById.mock.calls[0]).toMatchObject([
      USER_ID,
      {
        businessRegistration: {
          status: RegistrationVerificationStatus.NOT_FOUND,
        },
      },
    ]);
  });

  it('marks the registration unavailable when the lookup throws', async () => {
    // Arrange
    prembly.lookupCompany.mockRejectedValue(new Error('timeout'));

    // Act
    await service.handleVerifyRegistration(makeJob());

    // Assert
    expect(usersRepository.updateById.mock.calls[0]).toMatchObject([
      USER_ID,
      {
        businessRegistration: {
          status: RegistrationVerificationStatus.UNAVAILABLE,
        },
      },
    ]);
  });

  it('marks the registration unavailable without calling Prembly when not configured', async () => {
    // Arrange
    prembly.isConfigured = false;

    // Act
    await service.handleVerifyRegistration(makeJob());

    // Assert
    expect(prembly.lookupCompany).not.toHaveBeenCalled();
  });

  it('skips registrations that are no longer pending', async () => {
    // Arrange
    usersRepository.findById.mockResolvedValue({
      businessRegistration: {
        ...PENDING_REGISTRATION,
        status: RegistrationVerificationStatus.VERIFIED,
      },
    });

    // Act
    await service.handleVerifyRegistration(makeJob());

    // Assert
    expect(usersRepository.updateById).not.toHaveBeenCalled();
  });
});
