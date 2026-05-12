import { NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';
import { AgendaService } from 'src/modules/agenda/services/agenda.service';
import { BusinessRepository } from 'src/modules/business/repositories/business.repository';
import { EmployeesRepository } from 'src/modules/employees/repositories/employees.repository';
import { RedisService } from 'src/modules/redis/services/redis.service';
import { TasksRepository } from 'src/modules/tasks/repositories/tasks.repository';
import { TasksService } from 'src/modules/tasks/services/tasks.service';
import { TaskStage } from 'src/modules/tasks/schemas/task.schema';
import { UsersRepository } from 'src/modules/users/repositories/users.repository';

const BUSINESS_ID = new Types.ObjectId().toString();
const EMPLOYEE_ID = new Types.ObjectId().toString();
const TASK_ID = new Types.ObjectId().toString();
const USER_ID = new Types.ObjectId().toString();

describe('TasksService', () => {
  let service: TasksService;

  const tasksRepository = {
    findAll: jest.fn(),
    findById: jest.fn(),
    create: jest.fn(),
    updateById: jest.fn(),
    softDelete: jest.fn(),
    appendComment: jest.fn(),
    appendSubtask: jest.fn(),
    updateSubtaskCompletion: jest.fn(),
    findStageByKey: jest.fn(),
    upsertDefaultStages: jest.fn(),
    createActivity: jest.fn(),
    findActivitiesByTask: jest.fn(),
  };

  const employeesRepository = {
    findById: jest.fn(),
    findByUserId: jest.fn(),
  };

  const businessRepository = {
    findById: jest.fn(),
  };

  const usersRepository = {
    findById: jest.fn(),
  };

  const redisService = {
    get: jest.fn(),
    set: jest.fn(),
    delByPattern: jest.fn(),
  };

  const agendaService = {
    define: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new TasksService(
      tasksRepository as unknown as TasksRepository,
      employeesRepository as unknown as EmployeesRepository,
      usersRepository as unknown as UsersRepository,
      businessRepository as unknown as BusinessRepository,
      redisService as unknown as RedisService,
      agendaService as unknown as AgendaService,
    );
  });

  it('returns not found when creating task with unknown assignee', async () => {
    employeesRepository.findById.mockResolvedValue(null);
    employeesRepository.findByUserId.mockResolvedValue(null);
    usersRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(USER_ID),
      businessId: new Types.ObjectId(BUSINESS_ID),
      firstName: 'Task',
      lastName: 'Owner',
      deletedAt: null,
    });
    businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });

    const result = await service.createTask(BUSINESS_ID, USER_ID, {
      title: 'Fix bathroom leak',
      description: 'Address leak under the sink',
      assigneeId: EMPLOYEE_ID,
      priority: undefined,
      dueDate: '2026-04-20',
      stage: TaskStage.TODO,
    });

    expect(result).toBeInstanceOf(NotFoundException);
  });

  it('allows non-employee business user to comment on a task', async () => {
    usersRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(USER_ID),
      businessId: new Types.ObjectId(BUSINESS_ID),
      firstName: 'Business',
      lastName: 'Owner',
      deletedAt: null,
    });
    employeesRepository.findByUserId.mockResolvedValue(null);
    businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });
    tasksRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(TASK_ID),
      title: 'Fix sink',
    });
    tasksRepository.appendComment.mockResolvedValue({
      _id: new Types.ObjectId(TASK_ID),
      title: 'Fix sink',
      comments: [
        {
          content: 'Parts ordered',
        },
      ],
    });
    tasksRepository.createActivity.mockResolvedValue({
      _id: new Types.ObjectId(),
      type: 'comment_added',
    });

    const result = await service.addComment(TASK_ID, BUSINESS_ID, USER_ID, {
      content: 'Parts ordered',
    });

    expect(result).not.toBeInstanceOf(NotFoundException);
    expect(tasksRepository.appendComment).toHaveBeenCalledTimes(1);
    const appendCommentCall = tasksRepository.appendComment.mock.calls[0] as [
      string,
      Types.ObjectId,
      { authorId: Types.ObjectId; authorName: string; content: string },
    ];
    expect(appendCommentCall[0]).toBe(TASK_ID);
    expect(appendCommentCall[1]).toBeInstanceOf(Types.ObjectId);
    expect(appendCommentCall[2]).toMatchObject({
      authorName: 'Business Owner',
      content: 'Parts ordered',
    });
    expect(appendCommentCall[2].authorId).toBeInstanceOf(Types.ObjectId);
  });

  it('bootstraps default task stages for a business', async () => {
    tasksRepository.upsertDefaultStages.mockResolvedValue(undefined);

    const result = await service.bootstrapDefaultStages(BUSINESS_ID);

    expect(result).toBeNull();
    expect(tasksRepository.upsertDefaultStages).toHaveBeenCalledWith(
      expect.any(Types.ObjectId),
      expect.arrayContaining([
        expect.objectContaining({ key: TaskStage.TODO }),
        expect.objectContaining({ key: TaskStage.IN_PROGRESS }),
        expect.objectContaining({ key: TaskStage.COMPLETED }),
      ]),
    );
  });

  it('returns subtask not found when updating missing subtask', async () => {
    usersRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(USER_ID),
      businessId: new Types.ObjectId(BUSINESS_ID),
      firstName: 'Task',
      lastName: 'Owner',
      deletedAt: null,
    });
    employeesRepository.findByUserId.mockResolvedValue(null);
    businessRepository.findById.mockResolvedValue({ timezone: 'UTC' });
    tasksRepository.findById.mockResolvedValue({
      _id: new Types.ObjectId(TASK_ID),
      subtasks: [{ _id: new Types.ObjectId(), title: 'x', completed: false }],
    });

    const result = await service.updateSubtask(
      TASK_ID,
      new Types.ObjectId().toString(),
      BUSINESS_ID,
      USER_ID,
      { completed: true },
    );

    expect(result).toBeInstanceOf(NotFoundException);
  });
});
